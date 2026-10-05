import { ConfigService } from '@nestjs/config';
import { SdkRateLimitService } from './sdk-rate-limit.service';
import { SdkRateLimitGuard } from './sdk-rate-limit.guard';

describe('SDK single-instance IP rate limiting', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });
  it('limits to configured requests, returns Retry-After, and resets after the window', () => {
    let now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const limiter = new SdkRateLimitService(
      new ConfigService({ monitoring: { sdkRateLimitPerMinute: 2 } }),
    );
    const retry = jest.fn();
    limiter.consume('ip', retry);
    limiter.consume('ip', retry);
    expect(() => limiter.consume('ip', retry)).toThrow(
      'SDK rate limit exceeded',
    );
    expect(retry).toHaveBeenCalledWith(60);
    limiter.consume('different', retry);
    now += 60000;
    expect(() => limiter.consume('ip', retry)).not.toThrow();
  });
  it('bounds the IP map and reclaims expired entries without evicting active quotas', () => {
    let now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const limiter = new SdkRateLimitService(
      new ConfigService({ monitoring: { sdkRateLimitMaxIps: 1 } }),
    );
    limiter.consume('one', jest.fn());
    expect(() => limiter.consume('two', jest.fn())).toThrow();
    now += 60000;
    expect(() => limiter.consume('two', jest.fn())).not.toThrow();
  });
  it('counts only SDK POST and uses request.ip instead of untrusted forwarded headers', () => {
    const limiter = { consume: jest.fn() };
    const guard = new SdkRateLimitGuard(limiter as never, new ConfigService());
    const context = (path: string, method: string) => ({
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          path,
          method,
          ip: 'remote',
          headers: { 'x-forwarded-for': 'forged' },
        }),
        getResponse: () => ({ setHeader: jest.fn() }),
      }),
    });
    for (const [path, method] of [
      ['/api/groups', 'POST'],
      ['/api/sdk/check', 'OPTIONS'],
      ['/api/sdk/check/extra', 'POST'],
    ])
      guard.canActivate(context(path, method) as never);
    expect(limiter.consume).not.toHaveBeenCalled();
    guard.canActivate(context('/api/sdk/check', 'POST') as never);
    expect(limiter.consume).toHaveBeenCalledWith(
      'remote',
      expect.any(Function),
    );
  });
});

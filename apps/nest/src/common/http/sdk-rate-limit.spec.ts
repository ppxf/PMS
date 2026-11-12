import { ConfigService } from '@nestjs/config';
import { SdkRateLimitService } from './sdk-rate-limit.service';
import { SdkRateLimitGuard } from './sdk-rate-limit.guard';

describe('SDK single-instance IP rate limiting', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });
  it('limits to configured requests, returns Retry-After, and resets after the window', async () => {
    let now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const limiter = new SdkRateLimitService(
      new ConfigService({ monitoring: { sdkRateLimitPerMinute: 2 } }),
    );
    const retry = jest.fn();
    await limiter.consume('ip', retry);
    await limiter.consume('ip', retry);
    await expect(limiter.consume('ip', retry)).rejects.toThrow(
      'SDK rate limit exceeded',
    );
    expect(retry).toHaveBeenCalledWith(60);
    await limiter.consume('different', retry);
    now += 60000;
    await expect(limiter.consume('ip', retry)).resolves.toBeUndefined();
  });
  it('bounds the IP map and reclaims expired entries without evicting active quotas', async () => {
    let now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const limiter = new SdkRateLimitService(
      new ConfigService({ monitoring: { sdkRateLimitMaxIps: 1 } }),
    );
    await limiter.consume('one', jest.fn());
    await expect(limiter.consume('two', jest.fn())).rejects.toThrow();
    now += 60000;
    await expect(limiter.consume('two', jest.fn())).resolves.toBeUndefined();
  });
  it('counts only SDK POST and uses request.ip instead of untrusted forwarded headers', async () => {
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
      await guard.canActivate(context(path, method) as never);
    expect(limiter.consume).not.toHaveBeenCalled();
    await guard.canActivate(context('/api/sdk/check', 'POST') as never);
    expect(limiter.consume).toHaveBeenCalledWith(
      'remote',
      expect.any(Function),
    );
  });
});

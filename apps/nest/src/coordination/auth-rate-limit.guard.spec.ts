import { AuthRateLimitGuard } from './auth-rate-limit.guard';
describe('authentication quota boundaries', () => {
  function context(email: string, ip = 'ip', controller = 'AuthController') {
    return {
      getType: () => 'http',
      getClass: () => ({ name: controller }),
      getHandler: () => ({ name: 'login' }),
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', body: { email }, ip }),
        getResponse: () => ({ setHeader: jest.fn() }),
      }),
    };
  }
  it('counts both trusted IP and normalized account without putting email in keys', async () => {
    const store = { consume: jest.fn().mockResolvedValue(0) };
    const guard = new AuthRateLimitGuard(store as never);
    await guard.canActivate(context(' Admin@Example.COM ') as never);
    expect(store.consume).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(store.consume.mock.calls)).not.toContain('@');
    const key = store.consume.mock.calls[1][0];
    await guard.canActivate(context('admin@example.com', 'other') as never);
    expect(store.consume.mock.calls[3][0]).toBe(key);
  });
  it('rejects exhausted quotas and leaves other controllers alone', async () => {
    const store = { consume: jest.fn().mockResolvedValue(60000) };
    const guard = new AuthRateLimitGuard(store as never);
    await expect(
      guard.canActivate(context('user@example.com') as never),
    ).rejects.toThrow('Authentication rate limit exceeded');
    store.consume.mockClear();
    await expect(
      guard.canActivate(context('', 'ip', 'OtherController') as never),
    ).resolves.toBe(true);
    expect(store.consume).not.toHaveBeenCalled();
  });
  it.each(['register', 'resendVerification', 'forgotPassword'])(
    'restricts %s mail sends per IP and account',
    async (action) => {
      const store = { consume: jest.fn().mockResolvedValue(0) };
      const ctx = {
        ...context('user@example.com'),
        getHandler: () => ({ name: action }),
      };
      await new AuthRateLimitGuard(store as never).canActivate(ctx as never);
      expect(store.consume.mock.calls[0].slice(1)).toEqual([10, 3600000]);
      expect(store.consume.mock.calls[1].slice(1)).toEqual([3, 3600000]);
    },
  );
});

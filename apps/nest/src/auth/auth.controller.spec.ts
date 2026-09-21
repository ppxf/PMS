import { AuthController } from './auth.controller';

describe('AuthController', () => {
  it('delegates login credentials to the service', async () => {
    const session = { accessToken: 'token', user: {}, permissions: [] };
    const auth = { login: jest.fn(async () => session) };
    const controller = new AuthController(auth as never);

    await expect(
      controller.login({ email: 'admin@example.com', password: '123456' }),
    ).resolves.toBe(session);
  });

  it('loads the current user by authenticated id', async () => {
    const current = { user: { id: 'user-1' }, permissions: [] };
    const auth = { getCurrentUser: jest.fn(async () => current) };
    const controller = new AuthController(auth as never);

    await expect(
      controller.me({ user: { id: 'user-1' } } as never),
    ).resolves.toBe(current);
    expect(auth.getCurrentUser).toHaveBeenCalledWith('user-1');
  });
});

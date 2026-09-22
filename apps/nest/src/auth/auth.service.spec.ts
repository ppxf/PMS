import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserStatus } from '../users/entities/user.entity';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const jwt = new JwtService({
    secret: 'test-secret-with-at-least-32-characters',
  });

  async function createSubject(overrides: Record<string, unknown> = {}) {
    const user = {
      id: 'user-1',
      email: 'admin@example.com',
      name: '系统管理员',
      passwordHash: await bcrypt.hash('123456', 4),
      permissions: ['user:read'],
      status: UserStatus.Active,
      ...overrides,
    };
    const users = {
      findActiveById: jest.fn(() => Promise.resolve(user)),
      findByEmail: jest.fn(() => Promise.resolve(user)),
      createPendingUser: jest.fn(),
    };
    const tokens = { create: jest.fn(() => Promise.resolve('plain-token')) };
    const mail = { sendEmailVerification: jest.fn(() => Promise.resolve()) };
    const dataSource = { transaction: jest.fn((work) => work({})) };
    return {
      service: new AuthService(
        users as never,
        jwt,
        tokens as never,
        mail as never,
        dataSource as never,
        {
          get: (_key: string, fallback: unknown) => fallback,
        } as never,
      ),
      users,
      tokens,
      mail,
    };
  }

  it('returns a verifiable session for valid credentials', async () => {
    const { service } = await createSubject();

    const result = await service.login('Admin@Example.com', '123456');
    const payload = await jwt.verifyAsync(result.accessToken);

    expect(payload).toMatchObject({
      sub: 'user-1',
      email: 'admin@example.com',
    });
    expect(result).toMatchObject({
      user: { id: 'user-1', name: '系统管理员', email: 'admin@example.com' },
      permissions: ['user:read'],
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('registers a pending user and sends a verification email', async () => {
    const { service, users, tokens, mail } = await createSubject();
    users.findByEmail.mockResolvedValueOnce(null as never);
    users.createPendingUser.mockResolvedValue({
      id: 'new-user',
      email: 'user@example.com',
    });

    await service.register({
      name: '测试用户',
      email: ' User@Example.com ',
      password: 'password123',
      passwordConfirmation: 'password123',
    });

    expect(users.createPendingUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user@example.com' }),
      expect.anything(),
    );
    expect(tokens.create).toHaveBeenCalled();
    expect(mail.sendEmailVerification).toHaveBeenCalledWith(
      'user@example.com',
      'plain-token',
    );
  });

  it.each([
    ['unknown email', null, '123456'],
    ['wrong password', undefined, 'wrong-password'],
    ['disabled user', { status: UserStatus.Disabled }, '123456'],
  ])('uses the same error for %s', async (_label, userOverride, password) => {
    const { service, users } = await createSubject(userOverride ?? {});
    if (userOverride === null)
      users.findByEmail.mockResolvedValueOnce(null as never);

    await expect(service.login('admin@example.com', password)).rejects.toEqual(
      new UnauthorizedException('邮箱或密码错误'),
    );
  });
});

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

function contextWith(request: { headers: Record<string, string>; user?: unknown }): ExecutionContext {
  return {
    getClass: () => class TestController {},
    getHandler: () => () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({ secret: 'test-secret-with-at-least-32-characters' });

  it('allows public routes without a token', async () => {
    const reflector = { getAllAndOverride: jest.fn(() => true) };
    const guard = new JwtAuthGuard(reflector as never, jwt, {} as never);

    await expect(guard.canActivate(contextWith({ headers: {} }))).resolves.toBe(true);
  });

  it('rejects requests without a bearer token', async () => {
    const guard = new JwtAuthGuard(new Reflector(), jwt, {} as never);

    await expect(guard.canActivate(contextWith({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches the active user for a valid token', async () => {
    const token = await jwt.signAsync({ sub: 'user-1', email: 'admin@example.com' });
    const user = {
      id: 'user-1',
      name: '系统管理员',
      email: 'admin@example.com',
      permissions: ['user:read'],
    };
    const users = { findActiveById: jest.fn(async () => user) };
    const request = { headers: { authorization: `Bearer ${token}` }, user: undefined };
    const guard = new JwtAuthGuard(new Reflector(), jwt, users as never);

    await expect(guard.canActivate(contextWith(request))).resolves.toBe(true);
    expect(request.user).toEqual(user);
  });

  it.each([
    ['invalid token', 'not-a-jwt', { findActiveById: jest.fn() }],
    [
      'missing user',
      null,
      { findActiveById: jest.fn(async () => null) },
    ],
  ])('rejects an %s', async (_label, tokenFixture, users) => {
    const token =
      tokenFixture ??
      (await jwt.signAsync({ sub: 'missing', email: 'missing@example.com' }));
    const guard = new JwtAuthGuard(new Reflector(), jwt, users as never);

    await expect(
      guard.canActivate(contextWith({ headers: { authorization: `Bearer ${token}` } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

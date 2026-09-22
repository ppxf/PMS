import { AuthTokensService, AuthTokenType } from './auth-tokens.service';
import { AuthToken } from './entities/auth-token.entity';
import { User, UserStatus } from '../users/entities/user.entity';

describe('AuthTokensService', () => {
  it('returns a 32-byte token and stores only its SHA-256 hash', async () => {
    let saved: Record<string, unknown> | undefined;
    const repository = {
      update: jest.fn(() => Promise.resolve()),
      create: jest.fn((input) => input),
      save: jest.fn((input) => {
        saved = input;
        return Promise.resolve(input);
      }),
    };
    const service = new AuthTokensService(repository as never);

    const token = await service.create(
      'user-1',
      AuthTokenType.EmailVerification,
      30,
    );

    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(saved?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(saved?.tokenHash).not.toBe(token);
  });

  it('locks only the token row before loading its user in a transaction', async () => {
    const user = {
      id: 'user-1',
      status: UserStatus.PendingVerification,
    } as User;
    const storedToken = {
      id: 'token-1',
      userId: user.id,
      type: AuthTokenType.EmailVerification,
    } as AuthToken;
    const tokenRepository = {
      findOne: jest.fn((options: { relations?: unknown }) => {
        if (options.relations) {
          throw new Error(
            'FOR UPDATE cannot be applied to the nullable side of an outer join',
          );
        }
        return Promise.resolve(storedToken);
      }),
    };
    const userRepository = {
      findOneBy: jest.fn(() => Promise.resolve(user)),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === AuthToken ? tokenRepository : userRepository,
      ),
    };
    const service = new AuthTokensService(tokenRepository as never);

    const result = await service.findValid(
      'verification-token',
      AuthTokenType.EmailVerification,
      manager as never,
    );

    expect(result).toMatchObject({
      id: 'token-1',
      user,
    });
  });
});

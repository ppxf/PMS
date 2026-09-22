import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, MoreThan, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { AuthToken, AuthTokenType } from './entities/auth-token.entity';

export { AuthTokenType } from './entities/auth-token.entity';

@Injectable()
export class AuthTokensService {
  constructor(
    @InjectRepository(AuthToken)
    private readonly repository: Repository<AuthToken>,
  ) {}

  async create(
    userId: string,
    type: AuthTokenType,
    expiresInMinutes: number,
    manager?: EntityManager,
  ): Promise<string> {
    const repository = manager?.getRepository(AuthToken) ?? this.repository;
    await repository.update(
      { userId, type, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );
    const token = randomBytes(32).toString('base64url');
    await repository.save(
      repository.create({
        userId,
        type,
        tokenHash: this.hash(token),
        expiresAt: new Date(Date.now() + expiresInMinutes * 60_000),
        consumedAt: null,
      }),
    );
    return token;
  }

  async findValid(
    token: string,
    type: AuthTokenType,
    manager?: EntityManager,
  ): Promise<AuthToken | null> {
    const options = {
      where: {
        tokenHash: this.hash(token),
        type,
        consumedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    };

    if (!manager) {
      return this.repository.findOne({
        ...options,
        relations: { user: true },
      });
    }

    const storedToken = await manager.getRepository(AuthToken).findOne({
      ...options,
      lock: { mode: 'pessimistic_write' },
    });
    if (!storedToken) return null;

    const user = await manager
      .getRepository(User)
      .findOneBy({ id: storedToken.userId });
    if (!user) return null;

    storedToken.user = user;
    return storedToken;
  }

  consumeAll(
    userId: string,
    type: AuthTokenType,
    manager?: EntityManager,
  ): Promise<unknown> {
    return (manager?.getRepository(AuthToken) ?? this.repository).update(
      { userId, type, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

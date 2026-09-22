import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { User, UserStatus } from './entities/user.entity';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name: string;
  permissions: string[];
}

export type CreatePendingUserInput = Omit<CreateUserInput, 'permissions'>;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repository: Repository<User>,
  ) {}

  findByEmail(email: string, manager?: EntityManager): Promise<User | null> {
    return (manager?.getRepository(User) ?? this.repository).findOne({
      where: { email: email.trim().toLowerCase() },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        name: true,
        status: true,
        permissions: true,
      },
    });
  }

  findActiveById(id: string): Promise<User | null> {
    return this.repository.findOne({
      where: { id, status: UserStatus.Active },
    });
  }

  async create(input: CreateUserInput): Promise<User> {
    const user = this.repository.create({
      ...input,
      email: input.email.trim().toLowerCase(),
      status: UserStatus.Active,
    });
    return this.repository.save(user);
  }

  async createPendingUser(
    input: CreatePendingUserInput,
    manager?: EntityManager,
  ): Promise<User> {
    const repository = manager?.getRepository(User) ?? this.repository;
    const user = repository.create({
      ...input,
      email: input.email.trim().toLowerCase(),
      permissions: [],
      status: UserStatus.PendingVerification,
    });
    return repository.save(user);
  }

  activate(id: string, manager?: EntityManager): Promise<unknown> {
    return (manager?.getRepository(User) ?? this.repository).update(id, {
      status: UserStatus.Active,
    });
  }

  updatePassword(
    id: string,
    passwordHash: string,
    manager?: EntityManager,
  ): Promise<unknown> {
    return (manager?.getRepository(User) ?? this.repository).update(id, {
      passwordHash,
    });
  }
}

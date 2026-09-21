import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from './entities/user.entity';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name: string;
  permissions: string[];
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repository: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.repository.findOne({
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
}

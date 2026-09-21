import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';

const ADMIN_PERMISSIONS = [
  'user:read',
  'user:create',
  'user:update',
  'user:delete',
];

@Injectable()
export class AdminSeederService implements OnApplicationBootstrap {
  constructor(
    private readonly config: ConfigService,
    private readonly users: UsersService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.get<boolean>('database.enabled', false)) return;

    const email = this.config
      .get<string>('auth.adminEmail', 'admin@example.com')
      .trim()
      .toLowerCase();
    if (await this.users.findByEmail(email)) return;

    const password = this.config.get<string>('auth.adminPassword', '123456');
    const passwordHash = await bcrypt.hash(password, 12);

    await this.users.create({
      email,
      passwordHash,
      name: this.config.get<string>('auth.adminName', '系统管理员'),
      permissions: ADMIN_PERMISSIONS,
    });
  }
}

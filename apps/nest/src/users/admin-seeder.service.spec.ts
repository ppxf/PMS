import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { AdminSeederService } from './admin-seeder.service';

describe('AdminSeederService', () => {
  const config = new ConfigService({
    database: { enabled: true },
    auth: {
      adminEmail: 'Admin@Example.com',
      adminName: '系统管理员',
      adminPassword: '123456',
    },
  });

  it('creates the administrator once with a hashed password', async () => {
    const users = {
      create: jest.fn((input) => Promise.resolve(input)),
      findByEmail: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: '1' }),
    };
    const seeder = new AdminSeederService(config, users as never);

    await seeder.onApplicationBootstrap();
    await seeder.onApplicationBootstrap();

    expect(users.create).toHaveBeenCalledTimes(1);
    const created = users.create.mock.calls[0][0];
    expect(created.email).toBe('admin@example.com');
    expect(created.passwordHash).not.toBe('123456');
    expect(await bcrypt.compare('123456', created.passwordHash)).toBe(true);
    expect(created.permissions).toEqual([
      'user:read',
      'user:create',
      'user:update',
      'user:delete',
    ]);
  });

  it('does not access users when the database is disabled', async () => {
    const users = { create: jest.fn(), findByEmail: jest.fn() };
    const seeder = new AdminSeederService(
      new ConfigService({ database: { enabled: false } }),
      users as never,
    );

    await seeder.onApplicationBootstrap();

    expect(users.findByEmail).not.toHaveBeenCalled();
  });
});

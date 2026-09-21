import { User, UserStatus } from './entities/user.entity';
import { UsersService } from './users.service';

describe('UsersService', () => {
  it('normalizes email before querying', async () => {
    let queriedEmail = '';
    const repository = {
      findOne: jest.fn(({ where }: { where: { email: string } }) => {
        queriedEmail = where.email;
        return Promise.resolve(null);
      }),
    };
    const service = new UsersService(repository as never);

    await service.findByEmail(' Admin@Example.com ');

    expect(queriedEmail).toBe('admin@example.com');
  });

  it('returns only active users by id', async () => {
    const repository = {
      findOne: jest.fn(() => Promise.resolve({ id: 'user-1' } as User)),
    };
    const service = new UsersService(repository as never);

    await service.findActiveById('user-1');

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 'user-1', status: UserStatus.Active },
    });
  });
});

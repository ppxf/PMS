import { ConflictException, NotFoundException } from '@nestjs/common';
import { GroupsService } from './groups.service';

describe('GroupsService', () => {
  const makeRepository = () => ({
    create: jest.fn((input) => ({ id: 'group-1', ...input })),
    save: jest.fn((input) => Promise.resolve(input)),
    find: jest.fn(() => Promise.resolve([])),
    findOne: jest.fn(() => Promise.resolve(null)),
    createQueryBuilder: jest.fn(() => ({
      addSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn(() =>
        Promise.resolve({
          entities: [{ id: 'group-1' }],
          raw: [{ projectCount: '2' }],
        }),
      ),
      groupBy: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
    })),
  });

  it('creates a group owned by the current user', async () => {
    const repository = makeRepository();
    const service = new GroupsService(repository as never);

    await expect(
      service.create('user-1', { name: 'Acme Team' }),
    ).resolves.toMatchObject({
      name: 'Acme Team',
      ownerId: 'user-1',
      slug: 'acme-team',
    });
  });

  it('lists only groups owned by the current user', async () => {
    const repository = makeRepository();
    const service = new GroupsService(repository as never);

    await expect(service.listOwned('user-1')).resolves.toEqual([
      { id: 'group-1', projectCount: 2 },
    ]);
    expect(repository.createQueryBuilder).toHaveBeenCalledWith('group');
  });

  it('finds a group by owner and slug', async () => {
    const repository = makeRepository();
    repository.findOne.mockResolvedValue({ id: 'group-1' } as never);
    const service = new GroupsService(repository as never);

    await expect(
      service.findOwnedBySlug('user-1', 'acme-team'),
    ).resolves.toEqual({ id: 'group-1' });
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { ownerId: 'user-1', slug: 'acme-team' },
    });
  });

  it('hides groups that are not owned by the current user', async () => {
    const service = new GroupsService(makeRepository() as never);

    await expect(
      service.findOwnedBySlug('user-2', 'acme-team'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps a duplicate slug to a conflict', async () => {
    const repository = makeRepository();
    repository.save.mockRejectedValue({ code: '23505' });
    const service = new GroupsService(repository as never);

    await expect(
      service.create('user-1', { name: 'Acme Team' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

import { ConflictException, NotFoundException } from '@nestjs/common';
import { GroupsService } from './groups.service';

describe('GroupsService', () => {
  const makeRepository = () => ({
    create: jest.fn((input) => ({ id: 'group-1', ...input })),
    save: jest.fn((input) => Promise.resolve(input)),
    find: jest.fn(() => Promise.resolve([])),
    findOne: jest
      .fn<
        Promise<unknown>,
        [options: { where: { id?: string; slug?: string; ownerId?: string } }]
      >()
      .mockResolvedValue(null),
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
    repository.findOne.mockResolvedValue({ id: 'group-1' });
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
  it('resolves UUID group paths without choosing between same-name owners', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440001';
    const service = new GroupsService(makeRepository() as never);
    jest.spyOn(service, 'listAccessible').mockResolvedValue([
      { id, slug: 'team' },
      { id: 'other', slug: 'team' },
    ] as never);
    await expect(
      service.findAccessibleBySlug('member', id),
    ).resolves.toMatchObject({ id, slug: 'team' });
    await expect(
      service.findAccessibleBySlug('member', 'team'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('keeps UUID-shaped legacy group slugs without falling back from inaccessible IDs', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440001';
    const repository = makeRepository();
    const service = new GroupsService(repository as never);
    jest
      .spyOn(service, 'listAccessible')
      .mockResolvedValue([{ id: 'legacy', slug: uuid }] as never);
    await expect(
      service.findAccessibleBySlug('member', uuid),
    ).resolves.toMatchObject({ id: 'legacy' });
    repository.findOne.mockResolvedValue({
      id: uuid,
      slug: 'unavailable',
    });
    await expect(
      service.findAccessibleBySlug('member', uuid),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('does not create under an owned legacy slug when the UUID belongs to another group', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440001';
    const repository = makeRepository();
    repository.findOne.mockImplementation(
      ({
        where,
      }: {
        where: { id?: string; slug?: string; ownerId?: string };
      }) =>
        Promise.resolve(
          where.id === uuid && !where.ownerId
            ? ({ id: uuid, ownerId: 'other' } as never)
            : where.slug === uuid
              ? ({ id: 'legacy', ownerId: 'owner', slug: uuid } as never)
              : null,
        ),
    );
    await expect(
      new GroupsService(repository as never).findOwnedBySlug('owner', uuid),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('can still write under a UUID-shaped legacy slug when no such group ID exists', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440001';
    const repository = makeRepository();
    repository.findOne.mockImplementation(
      ({ where }: { where: { slug?: string } }) =>
        Promise.resolve(
          where.slug === uuid
            ? ({ id: 'legacy', ownerId: 'owner', slug: uuid } as never)
            : null,
        ),
    );
    await expect(
      new GroupsService(repository as never).findOwnedBySlug('owner', uuid),
    ).resolves.toMatchObject({ id: 'legacy' });
  });
});

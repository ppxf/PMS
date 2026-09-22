import { GroupsController } from './groups.controller';

describe('GroupsController', () => {
  it('uses the authenticated user for every group operation', async () => {
    const groups = {
      create: jest.fn(() => Promise.resolve({ id: 'group-1' })),
      listOwned: jest.fn(() => Promise.resolve([])),
      findOwnedBySlug: jest.fn(() => Promise.resolve({ id: 'group-1' })),
    };
    const controller = new GroupsController(groups as never);
    const request = { user: { id: 'user-1' } } as never;

    await controller.create(request, { name: 'Acme Team' });
    await controller.list(request);
    await controller.detail(request, 'acme-team');

    expect(groups.create).toHaveBeenCalledWith('user-1', {
      name: 'Acme Team',
    });
    expect(groups.listOwned).toHaveBeenCalledWith('user-1');
    expect(groups.findOwnedBySlug).toHaveBeenCalledWith('user-1', 'acme-team');
  });
});

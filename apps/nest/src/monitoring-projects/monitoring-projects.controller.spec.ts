import { MonitoringProjectsController } from './monitoring-projects.controller';

describe('MonitoringProjectsController', () => {
  it('scopes project operations to the authenticated user and group', async () => {
    const projects = {
      create: jest.fn(() => Promise.resolve({ id: 'project-1' })),
      listOwned: jest.fn(() => Promise.resolve([])),
      findOwnedBySlug: jest.fn(() => Promise.resolve({ id: 'project-1' })),
      getConnection: jest.fn(() =>
        Promise.resolve({ connected: false, lastSeenAt: null }),
      ),
    };
    const controller = new MonitoringProjectsController(projects as never);
    const request = { user: { id: 'user-1' } } as never;
    const input = { name: 'Frontend', platform: 'vue' as const };

    await controller.create(request, 'acme-team', input);
    await controller.list(request, 'acme-team');
    await controller.detail(request, 'acme-team', 'frontend');
    await controller.connection(request, 'acme-team', 'frontend');

    expect(projects.create).toHaveBeenCalledWith('user-1', 'acme-team', input);
    expect(projects.listOwned).toHaveBeenCalledWith('user-1', 'acme-team');
    expect(projects.findOwnedBySlug).toHaveBeenCalledWith(
      'user-1',
      'acme-team',
      'frontend',
    );
    expect(projects.getConnection).toHaveBeenCalledWith(
      'user-1',
      'acme-team',
      'frontend',
    );
  });
});

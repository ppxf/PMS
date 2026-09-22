import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { MonitoringProjectsService } from './monitoring-projects.service';

describe('MonitoringProjectsService', () => {
  const group = { id: 'group-1', slug: 'acme-team' };
  const makeRepository = () => ({
    create: jest.fn((input) => input),
    save: jest.fn((input) =>
      Promise.resolve({
        id: '550e8400-e29b-41d4-a716-446655440000',
        createdAt: new Date('2026-09-22T00:00:00Z'),
        updatedAt: new Date('2026-09-22T00:00:00Z'),
        ...input,
      }),
    ),
    find: jest.fn(() => Promise.resolve([])),
    findOne: jest.fn(() => Promise.resolve(null)),
    update: jest.fn(() => Promise.resolve()),
  });
  const makeGroups = () => ({
    findOwnedBySlug: jest.fn(() => Promise.resolve(group)),
  });

  it('creates a Vue project with the default feature switches and DSN', async () => {
    const repository = makeRepository();
    const groups = makeGroups();
    const service = new MonitoringProjectsService(
      repository as never,
      groups as never,
      new ConfigService({
        monitoring: { publicUrl: 'http://localhost:3001' },
      }),
    );

    const created = await service.create('user-1', 'acme-team', {
      name: 'My Vue App',
      platform: 'vue',
    });

    expect(groups.findOwnedBySlug).toHaveBeenCalledWith('user-1', 'acme-team');
    expect(created).toMatchObject({
      errorMonitoringEnabled: true,
      loggingEnabled: false,
      metricsEnabled: false,
      name: 'My Vue App',
      platform: 'vue',
      slug: 'my-vue-app',
      tracingEnabled: false,
    });
    expect(created.dsn).toMatch(
      /^http:\/\/[a-f0-9]+@localhost:3001\/api\/sdk\/550e8400-e29b-41d4-a716-446655440000$/,
    );
  });

  it('persists explicit feature switches', async () => {
    const repository = makeRepository();
    const service = new MonitoringProjectsService(
      repository as never,
      makeGroups() as never,
      new ConfigService({
        monitoring: { publicUrl: 'https://monitor.example.com' },
      }),
    );

    const created = await service.create('user-1', 'acme-team', {
      name: 'Frontend',
      platform: 'vue',
      errorMonitoringEnabled: false,
      loggingEnabled: true,
      tracingEnabled: true,
      metricsEnabled: true,
    });

    expect(created).toMatchObject({
      errorMonitoringEnabled: false,
      loggingEnabled: true,
      tracingEnabled: true,
      metricsEnabled: true,
    });
    expect(created.dsn).toMatch(/^https:\/\//);
  });

  it('maps duplicate project slugs to a conflict', async () => {
    const repository = makeRepository();
    repository.save.mockRejectedValue({ code: '23505' });
    const service = new MonitoringProjectsService(
      repository as never,
      makeGroups() as never,
      new ConfigService({
        monitoring: { publicUrl: 'http://localhost:3001' },
      }),
    );

    await expect(
      service.create('user-1', 'acme-team', {
        name: 'Frontend',
        platform: 'vue',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('validates a public key and records the connection time', async () => {
    const repository = makeRepository();
    repository.findOne.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440000',
      platform: 'vue',
      publicKey: 'public-key',
    } as never);
    const service = new MonitoringProjectsService(
      repository as never,
      makeGroups() as never,
      new ConfigService({
        monitoring: { publicUrl: 'http://localhost:3001' },
      }),
    );

    const result = await service.checkConnection(
      '550e8400-e29b-41d4-a716-446655440000',
      'public-key',
    );

    expect(result).toMatchObject({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      platform: 'vue',
      checkedAt: expect.any(Date),
    });
    expect(repository.findOne).toHaveBeenCalledWith({
      where: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        publicKey: 'public-key',
      },
    });
    expect(repository.update).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      { lastSeenAt: expect.any(Date) },
    );
  });
});

import { ConfigService } from '@nestjs/config';
import { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
import { ProjectAccessService } from './project-access.service';

describe('project list access responses', () => {
  it('serializes an authorized list without repeated project reads or member secrets', async () => {
    const projects = [
      {
        id: 'own',
        groupId: 'group',
        ownerId: 'user',
        slug: 'web',
        publicKey: 'owner-key',
        lastSeenAt: null,
      },
      {
        id: 'shared',
        groupId: 'group',
        ownerId: 'other',
        slug: 'web',
        publicKey: 'member-secret',
        dsn: 'must-not-leak',
        allowedOrigins: ['private-origin'],
        lastSeenAt: new Date(),
      },
    ];
    const query = {
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(projects),
    };
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(query),
      find: jest.fn(),
    };
    const members = {
      find: jest
        .fn()
        .mockResolvedValue([
          { projectId: 'shared', permissions: ['project:logs:read'] },
        ]),
    };
    const access = new ProjectAccessService(
      repository as never,
      members as never,
    );
    const groups = {
      findAccessibleBySlug: jest.fn().mockResolvedValue({ id: 'group' }),
    };
    const service = new MonitoringProjectsService(
      repository as never,
      groups as never,
      new ConfigService(),
      access,
    );
    const result = await service.listAccessible('user', 'group');
    expect(result[0]).toMatchObject({
      id: 'own',
      slug: 'web',
      role: 'owner',
      publicKey: 'owner-key',
    });
    expect(result[1]).toMatchObject({
      id: 'shared',
      slug: 'web',
      role: 'member',
      connected: true,
      permissions: ['project:logs:read'],
    });
    expect(result[1]).not.toHaveProperty('publicKey');
    expect(result[1]).not.toHaveProperty('dsn');
    expect(result[1]).not.toHaveProperty('allowedOrigins');
    expect(repository.find).not.toHaveBeenCalled();
    expect(members.find).toHaveBeenCalledTimes(1);
  });
});

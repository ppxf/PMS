import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { MonitoringProject } from '../monitoring-projects/entities/monitoring-project.entity';
import { ProjectMember } from './project-member.entity';
import { ProjectAccessService } from './project-access.service';
import { PROJECT_PERMISSIONS } from './project-permissions';
describe('ProjectAccessService', () => {
  const project = { id: 'p', ownerId: 'owner' } as MonitoringProject;
  const groupIds = { existsBy: jest.fn() };
  const projects = {
    find: jest.fn(),
    existsBy: jest.fn(),
    manager: { getRepository: () => groupIds },
  };
  const members = { findOne: jest.fn(), find: jest.fn() };
  const service = new ProjectAccessService(
    projects as unknown as Repository<MonitoringProject>,
    members as unknown as Repository<ProjectMember>,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    projects.find.mockResolvedValue([project]);
    projects.existsBy.mockResolvedValue(false);
    groupIds.existsBy.mockResolvedValue(false);
    members.findOne.mockResolvedValue(null);
    members.find.mockResolvedValue([]);
  });
  it('grants owner every page permission', async () => {
    expect(
      (await service.requireAccess('owner', 'g', 'p')).permissions,
    ).toEqual([...PROJECT_PERMISSIONS]);
  });
  it('denies strangers', async () => {
    await expect(
      service.requireAccess('stranger', 'g', 'p'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('limits members to known granted permissions and denies writes', async () => {
    members.find.mockResolvedValue([
      { projectId: 'p', permissions: ['project:issues:read', 'unknown'] },
    ]);
    expect(
      (await service.requireAccess('member', 'g', 'p')).permissions,
    ).toEqual(['project:issues:read']);
    await expect(
      service.requireOwner('member', 'g', 'p'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.requirePermission('member', 'g', 'p', 'project:logs:read'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects ambiguous authorized paths', async () => {
    projects.find.mockResolvedValue([project, { ...project, id: 'other' }]);
    await expect(
      service.requireAccess('owner', 'g', 'p'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('resolves UUID paths by ID while retaining actual slugs', async () => {
    const groupId = '550e8400-e29b-41d4-a716-446655440001';
    const projectId = '550e8400-e29b-41d4-a716-446655440002';
    const first = {
      id: projectId,
      ownerId: 'owner',
      slug: 'web',
      group: { id: groupId, slug: 'team' },
    };
    projects.find.mockImplementation(({ where }) =>
      Promise.resolve(
        where.id === projectId && where.group.id === groupId
          ? [first]
          : [first, { ...first, id: 'other' }],
      ),
    );
    await expect(
      service.requireAccess('owner', groupId, projectId),
    ).resolves.toMatchObject({ project: first });
    await expect(
      service.requireAccess('owner', 'team', 'web'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('loads memberships once for a multi-project listing and filters unknown grants', async () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      id: `p-${index}`,
      ownerId: 'owner',
    })) as MonitoringProject[];
    members.find.mockResolvedValue(
      many.map((project) => ({
        projectId: project.id,
        permissions: ['project:logs:read', 'unknown'],
      })),
    );
    const result = await service.listAccess('member', many);
    expect(result).toHaveLength(20);
    expect(
      result.every(
        (access) =>
          access.role === 'member' &&
          access.permissions.join(',') === 'project:logs:read',
      ),
    ).toBe(true);
    expect(members.find).toHaveBeenCalledTimes(1);
  });
  it('falls back to legacy UUID-shaped slugs only when canonical IDs do not exist', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440001';
    projects.find.mockResolvedValueOnce([]).mockResolvedValueOnce([project]);
    await expect(
      service.requireAccess('owner', uuid, uuid),
    ).resolves.toMatchObject({ project });
    expect(projects.find).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { slug: uuid, group: { slug: uuid } },
      }),
    );
    projects.find.mockClear();
    projects.find.mockResolvedValue([{ ...project, ownerId: 'someone-else' }]);
    await expect(
      service.requireAccess('owner', uuid, uuid),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(projects.find).toHaveBeenCalledTimes(1);
  });
  it('never changes an existing group ID into another group slug when its project is missing', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440001';
    groupIds.existsBy.mockResolvedValue(true);
    projects.find.mockResolvedValueOnce([]).mockResolvedValueOnce([project]);
    await expect(
      service.requireAccess('owner', uuid, 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(projects.find).toHaveBeenCalledTimes(1);
  });
  it('never changes an existing project ID into another project slug in a different group', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440001';
    projects.existsBy.mockResolvedValue(true);
    projects.find.mockResolvedValueOnce([]).mockResolvedValueOnce([project]);
    await expect(
      service.requireAccess('owner', 'other-group', uuid),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(projects.find).toHaveBeenCalledTimes(1);
  });
  it('resolves a legacy UUID-shaped project slug within its existing canonical group ID', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440001';
    groupIds.existsBy.mockResolvedValue(true);
    projects.find.mockResolvedValueOnce([]).mockResolvedValueOnce([project]);
    await expect(
      service.requireAccess('owner', uuid, uuid),
    ).resolves.toMatchObject({ project });
    expect(projects.find).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { slug: uuid, group: { id: uuid } } }),
    );
  });
});

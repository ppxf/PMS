import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { MonitoringProject } from '../monitoring-projects/entities/monitoring-project.entity';
import { ProjectMember } from './project-member.entity';
import { ProjectAccessService } from './project-access.service';
import { PROJECT_PERMISSIONS } from './project-permissions';
describe('ProjectAccessService', () => {
  const project = { id: 'p', ownerId: 'owner' } as MonitoringProject;
  const projects = { find: jest.fn() };
  const members = { findOne: jest.fn() };
  const service = new ProjectAccessService(
    projects as unknown as Repository<MonitoringProject>,
    members as unknown as Repository<ProjectMember>,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    projects.find.mockResolvedValue([project]);
    members.findOne.mockResolvedValue(null);
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
    members.findOne.mockResolvedValue({
      permissions: ['project:issues:read', 'unknown'],
    });
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
});

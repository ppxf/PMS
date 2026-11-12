import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MonitoringProject } from '../monitoring-projects/entities/monitoring-project.entity';
import { ProjectMember } from './project-member.entity';
import { PROJECT_PERMISSIONS, ProjectPermission } from './project-permissions';
@Injectable()
export class ProjectAccessService {
  constructor(
    @InjectRepository(MonitoringProject)
    private readonly projects: Repository<MonitoringProject>,
    @InjectRepository(ProjectMember)
    private readonly members: Repository<ProjectMember>,
  ) {}
  async requireAccess(userId: string, groupSlug: string, projectSlug: string) {
    const candidates = await this.projects.find({
      where: { slug: projectSlug, group: { slug: groupSlug } },
      relations: { group: true },
      order: { id: 'ASC' },
    });
    const accessible: {
      project: MonitoringProject;
      role: 'owner' | 'member';
      permissions: string[];
    }[] = [];
    for (const project of candidates) {
      if (project.ownerId === userId)
        accessible.push({
          project,
          role: 'owner',
          permissions: [...PROJECT_PERMISSIONS],
        });
      else {
        const member = await this.members.findOne({
          where: { projectId: project.id, userId },
        });
        if (member)
          accessible.push({
            project,
            role: 'member',
            permissions: member.permissions.filter((p) =>
              (PROJECT_PERMISSIONS as readonly string[]).includes(p),
            ),
          });
      }
    }
    if (accessible.length !== 1)
      throw new NotFoundException('Monitoring project not found or ambiguous');
    return accessible[0];
  }
  async requirePermission(
    userId: string,
    groupSlug: string,
    projectSlug: string,
    permission: ProjectPermission,
  ) {
    const access = await this.requireAccess(userId, groupSlug, projectSlug);
    if (!access.permissions.includes(permission))
      throw new ForbiddenException('Project permission required');
    return access;
  }
  async requireOwner(userId: string, groupSlug: string, projectSlug: string) {
    const access = await this.requireAccess(userId, groupSlug, projectSlug);
    if (access.role !== 'owner')
      throw new ForbiddenException('Project owner required');
    return access;
  }
}

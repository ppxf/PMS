import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  legacyProjectRouteWhere,
  projectRouteIdentifier,
} from './project-route-identifier';
import { MonitoringProject } from '../monitoring-projects/entities/monitoring-project.entity';
import { ProjectMember } from './project-member.entity';
import { PROJECT_PERMISSIONS, ProjectPermission } from './project-permissions';
interface AccessResult {
  project: MonitoringProject;
  role: 'owner' | 'member';
  permissions: string[];
}
@Injectable()
export class ProjectAccessService {
  constructor(
    @InjectRepository(MonitoringProject)
    private readonly projects: Repository<MonitoringProject>,
    @InjectRepository(ProjectMember)
    private readonly members: Repository<ProjectMember>,
  ) {}
  async requireAccess(userId: string, groupSlug: string, projectSlug: string) {
    const projectIdentifier = projectRouteIdentifier(projectSlug);
    const groupIdentifier = projectRouteIdentifier(groupSlug);
    let candidates = await this.projects.find({
      where: {
        ...projectIdentifier,
        group: groupIdentifier,
      },
      relations: { group: true },
      order: { id: 'ASC' },
    });
    if (
      !candidates.length &&
      ('id' in projectIdentifier || 'id' in groupIdentifier)
    ) {
      const legacyWhere = await legacyProjectRouteWhere(
        this.projects,
        groupSlug,
        projectSlug,
      );
      if (legacyWhere)
        candidates = await this.projects.find({
          where: legacyWhere,
          relations: { group: true },
          order: { id: 'ASC' },
        });
    }
    const accessible = await this.listAccess(userId, candidates);
    if (accessible.length !== 1)
      throw new NotFoundException('Monitoring project not found or ambiguous');
    return accessible[0];
  }
  async listAccess(
    userId: string,
    projects: MonitoringProject[],
  ): Promise<AccessResult[]> {
    const otherIds = projects
      .filter((project) => project.ownerId !== userId)
      .map((project) => project.id);
    const memberships = otherIds.length
      ? await this.members.find({ where: { userId, projectId: In(otherIds) } })
      : [];
    const byProject = new Map(
      memberships.map((member) => [member.projectId, member]),
    );
    return projects.flatMap<AccessResult>((project) => {
      if (project.ownerId === userId)
        return [
          {
            project,
            role: 'owner' as const,
            permissions: [...PROJECT_PERMISSIONS] as string[],
          },
        ];
      const member = byProject.get(project.id);
      return member
        ? [
            {
              project,
              role: 'member' as const,
              permissions: member.permissions.filter((permission) =>
                (PROJECT_PERMISSIONS as readonly string[]).includes(permission),
              ),
            },
          ]
        : [];
    });
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

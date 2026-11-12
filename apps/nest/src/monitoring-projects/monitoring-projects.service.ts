import { ProjectAccessService } from '../project-access/project-access.service';
import { ProjectPermission } from '../project-access/project-permissions';
import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createSlug } from '../common/utils/slug';
import type { PropagationSettings } from './dto/propagation-settings.pipe';
import { GroupsService } from '../groups/groups.service';
import { CreateMonitoringProjectDto } from './dto/create-monitoring-project.dto';
import {
  MonitoringPlatform,
  MonitoringProject,
} from './entities/monitoring-project.entity';

export interface MonitoringProjectResponse extends MonitoringProject {
  connected: boolean;
  dsn: string;
}

@Injectable()
export class MonitoringProjectsService {
  constructor(
    @InjectRepository(MonitoringProject)
    private readonly repository: Repository<MonitoringProject>,
    private readonly groups: GroupsService,
    private readonly config: ConfigService,
    private readonly access: ProjectAccessService,
  ) {}

  async create(
    userId: string,
    groupSlug: string,
    input: CreateMonitoringProjectDto,
  ): Promise<MonitoringProjectResponse> {
    const group = await this.groups.findOwnedBySlug(userId, groupSlug);
    const project = this.repository.create({
      errorMonitoringEnabled: input.errorMonitoringEnabled ?? true,
      groupId: group.id,
      ownerId: userId,
      allowedOrigins: ['*'],
      lastSeenAt: null,
      loggingEnabled: input.loggingEnabled ?? false,
      metricsEnabled: input.metricsEnabled ?? false,
      profilesEnabled: input.profilesEnabled ?? false,
      name: input.name.trim(),
      platform: MonitoringPlatform.Vue,
      publicKey: randomBytes(16).toString('hex'),
      slug: createSlug(input.name, 'project'),
      tracingEnabled: input.tracingEnabled ?? false,
    });

    try {
      return this.toResponse(await this.repository.save(project));
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('A project with this name already exists');
      }
      throw error;
    }
  }

  async listOwned(
    userId: string,
    groupSlug: string,
  ): Promise<MonitoringProjectResponse[]> {
    const group = await this.groups.findOwnedBySlug(userId, groupSlug);
    const projects = await this.repository.find({
      order: { createdAt: 'DESC' },
      where: { groupId: group.id },
    });
    return projects.map((project) => this.toResponse(project));
  }

  async listAccessible(userId: string, groupSlug: string) {
    const group = await this.groups.findAccessibleBySlug(userId, groupSlug);
    const projects = await this.repository
      .createQueryBuilder('project')
      .leftJoin(
        'project_members',
        'member',
        'member.project_id = project.id AND member.user_id = :userId',
        { userId },
      )
      .where('project.groupId = :groupId', { groupId: group.id })
      .andWhere('(project.ownerId = :userId OR member.id IS NOT NULL)', {
        userId,
      })
      .orderBy('project.createdAt', 'DESC')
      .getMany();
    return Promise.all(
      projects.map((project) =>
        this.findAccessibleBySlug(userId, groupSlug, project.slug),
      ),
    );
  }
  async findOwnedBySlug(
    userId: string,
    groupSlug: string,
    projectSlug: string,
  ): Promise<MonitoringProjectResponse> {
    const { project } = await this.access.requireOwner(
      userId,
      groupSlug,
      projectSlug,
    );
    return this.toResponse(project);
  }

  async findReadableBySlug(
    userId: string,
    groupSlug: string,
    projectSlug: string,
    permission: ProjectPermission,
  ) {
    return (
      await this.access.requirePermission(
        userId,
        groupSlug,
        projectSlug,
        permission,
      )
    ).project;
  }
  async getAccess(userId: string, groupSlug: string, projectSlug: string) {
    const { project, role, permissions } = await this.access.requireAccess(
      userId,
      groupSlug,
      projectSlug,
    );
    return { projectId: project.id, role, permissions };
  }
  async findAccessibleBySlug(
    userId: string,
    groupSlug: string,
    projectSlug: string,
  ) {
    const { project, role, permissions } = await this.access.requireAccess(
      userId,
      groupSlug,
      projectSlug,
    );
    if (role === 'owner')
      return Object.assign(this.toResponse(project), {
        role,
        isOwner: true,
        permissions,
      });
    return {
      id: project.id,
      groupId: project.groupId,
      name: project.name,
      slug: project.slug,
      platform: project.platform,
      createdAt: project.createdAt,
      errorMonitoringEnabled: project.errorMonitoringEnabled, loggingEnabled: project.loggingEnabled, tracingEnabled: project.tracingEnabled, metricsEnabled: project.metricsEnabled, profilesEnabled: project.profilesEnabled, connected: Boolean(project.lastSeenAt), lastSeenAt: project.lastSeenAt,
      role,
      isOwner: false,
      permissions,
    };
  }
  async getConnection(
    userId: string,
    groupSlug: string,
    projectSlug: string,
  ): Promise<{ connected: boolean; lastSeenAt: Date | null }> {
    const project = await this.findOwnedBySlug(userId, groupSlug, projectSlug);
    return {
      connected: project.connected,
      lastSeenAt: project.lastSeenAt,
    };
  }

  async updateErrorMonitoring(
    userId: string,
    groupSlug: string,
    projectSlug: string,
    errorMonitoringEnabled: boolean,
  ): Promise<MonitoringProjectResponse> {
    const project = await this.findOwnedBySlug(userId, groupSlug, projectSlug);
    await this.repository.update(project.id, { errorMonitoringEnabled });
    return Object.assign(project, { errorMonitoringEnabled });
  }

  async updateTracing(
    userId: string,
    groupSlug: string,
    projectSlug: string,
    tracingEnabled: boolean,
  ): Promise<MonitoringProjectResponse> {
    const project = await this.findOwnedBySlug(userId, groupSlug, projectSlug);
    await this.repository.update(project.id, { tracingEnabled });
    return Object.assign(project, { tracingEnabled });
  }

  async updateMetrics(
    userId: string,
    groupSlug: string,
    projectSlug: string,
    metricsEnabled: boolean,
  ): Promise<MonitoringProjectResponse> {
    const project = await this.findOwnedBySlug(userId, groupSlug, projectSlug);
    await this.repository.update(project.id, { metricsEnabled });
    return Object.assign(project, { metricsEnabled });
  }

  async updateLogging(
    userId: string,
    groupSlug: string,
    projectSlug: string,
    loggingEnabled: boolean,
  ): Promise<MonitoringProjectResponse> {
    const project = await this.findOwnedBySlug(userId, groupSlug, projectSlug);
    await this.repository.update(project.id, { loggingEnabled });
    return Object.assign(project, { loggingEnabled });
  }

  async updateProfiles(
    userId: string,
    groupSlug: string,
    projectSlug: string,
    profilesEnabled: boolean,
  ): Promise<MonitoringProjectResponse> {
    const project = await this.findOwnedBySlug(userId, groupSlug, projectSlug);
    await this.repository.update(project.id, { profilesEnabled });
    return Object.assign(project, { profilesEnabled });
  }

  async updatePropagation(
    userId: string,
    groupSlug: string,
    projectSlug: string,
    settings: PropagationSettings,
  ): Promise<MonitoringProjectResponse> {
    const project = await this.findOwnedBySlug(userId, groupSlug, projectSlug);
    await this.repository.update(project.id, settings);
    return Object.assign(project, settings);
  }

  async allowsSdkOrigin(projectId: string, origin: string): Promise<boolean> {
    const project = await this.repository.findOne({
      select: { allowedOrigins: true },
      where: { id: projectId },
    });
    return Boolean(
      project?.allowedOrigins?.includes('*') ||
      project?.allowedOrigins?.includes(origin),
    );
  }

  async updateOrigins(
    userId: string,
    groupSlug: string,
    projectSlug: string,
    allowedOrigins: string[],
  ): Promise<MonitoringProjectResponse> {
    const project = await this.findOwnedBySlug(userId, groupSlug, projectSlug);
    await this.repository.update(project.id, { allowedOrigins });
    return Object.assign(project, { allowedOrigins });
  }

  async checkConnection(
    projectId: string,
    publicKey: string,
  ): Promise<{
    projectId: string;
    platform: MonitoringPlatform;
    checkedAt: Date;
  }> {
    const project = await this.repository.findOne({
      where: { id: projectId, publicKey },
    });
    if (!project) throw new NotFoundException('Monitoring project not found');

    const checkedAt = new Date();
    await this.repository.update(project.id, { lastSeenAt: checkedAt });
    return { projectId: project.id, platform: project.platform, checkedAt };
  }

  async findForIngestion(
    projectId: string,
    publicKey: string | undefined,
  ): Promise<MonitoringProject> {
    if (!publicKey?.trim())
      throw new NotFoundException('Monitoring project not found');
    const project = await this.repository.findOne({
      where: { id: projectId, publicKey },
    });
    if (!project) throw new NotFoundException('Monitoring project not found');
    return project;
  }

  private toResponse(project: MonitoringProject): MonitoringProjectResponse {
    return Object.assign(project, {
      connected: Boolean(project.lastSeenAt),
      dsn: this.buildDsn(project),
    });
  }

  private buildDsn(project: MonitoringProject): string {
    const url = new URL(
      this.config.get<string>('monitoring.publicUrl', 'http://localhost:3000'),
    );
    url.username = project.publicKey;
    url.pathname = `${url.pathname.replace(/\/$/, '')}/api/sdk/${project.id}`;
    return url.toString().replace(/\/$/, '');
  }
}


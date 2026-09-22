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
      lastSeenAt: null,
      loggingEnabled: input.loggingEnabled ?? false,
      metricsEnabled: input.metricsEnabled ?? false,
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
        throw new ConflictException('该项目名称已存在');
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

  async findOwnedBySlug(
    userId: string,
    groupSlug: string,
    projectSlug: string,
  ): Promise<MonitoringProjectResponse> {
    const group = await this.groups.findOwnedBySlug(userId, groupSlug);
    const project = await this.repository.findOne({
      where: { groupId: group.id, slug: projectSlug },
    });
    if (!project) throw new NotFoundException('监控项目不存在');
    return this.toResponse(project);
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
    if (!project) throw new NotFoundException('监控项目不存在');

    const checkedAt = new Date();
    await this.repository.update(project.id, { lastSeenAt: checkedAt });
    return { projectId: project.id, platform: project.platform, checkedAt };
  }

  private toResponse(project: MonitoringProject): MonitoringProjectResponse {
    return Object.assign(project, {
      connected: Boolean(project.lastSeenAt),
      dsn: this.buildDsn(project),
    });
  }

  private buildDsn(project: MonitoringProject): string {
    const url = new URL(
      this.config.get<string>('monitoring.publicUrl', 'http://localhost:3001'),
    );
    url.username = project.publicKey;
    url.pathname = `${url.pathname.replace(/\/$/, '')}/api/sdk/${project.id}`;
    return url.toString().replace(/\/$/, '');
  }
}

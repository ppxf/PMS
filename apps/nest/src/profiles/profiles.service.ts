import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
import { contentHash } from '../traces/traces.service';
import { ProfileEntity } from './profile.entity';
import { buildProfileOverview } from './profiles-overview';
import type {
  MonitoringProfile,
  ProfileEnvelope,
  ProfileQuery,
  ProfileSummary,
  ProfileDiagnosticEnvelope,
} from './profiles-contract';
import {
  ProfileEnvelopePipe,
  ProfileQueryPipe,
  ProfileDiagnosticPipe,
  validProfileId,
} from './profiles-validation';

@Injectable()
export class ProfilesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly projects: MonitoringProjectsService,
  ) {}
  async ingest(
    projectId: string,
    key: string | undefined,
    input: ProfileEnvelope,
  ): Promise<void> {
    const { profile } = new ProfileEnvelopePipe().transform(input);
    const project = await this.projects.findForIngestion(projectId, key);
    if (!project.profilesEnabled)
      throw new ForbiddenException('Profiles is disabled for this project');
    const hash = contentHash(profile);
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`profiles:${projectId}`],
      );
      const repository = manager.getRepository(ProfileEntity);
      const previous = await repository.findOneBy({
        projectId,
        profileId: profile.profileId,
      });
      if (previous) {
        if (previous.contentHash !== hash)
          throw new ConflictException(
            'Profile ID reused with different content',
          );
        return;
      }
      await repository.insert({
        projectId,
        ...profile,
        startedAt: new Date(profile.startedAt),
        profile: JSON.parse(JSON.stringify(profile)) as MonitoringProfile,
        sampleCount: profile.samples.length,
        contentHash: hash,
        receivedAt: new Date(),
      });
    });
  }
  async diagnostic(
    projectId: string,
    key: string | undefined,
    input: ProfileDiagnosticEnvelope,
  ): Promise<void> {
    const diagnostic = new ProfileDiagnosticPipe().transform(input);
    const project = await this.projects.findForIngestion(projectId, key);
    if (!project.profilesEnabled)
      throw new ForbiddenException('Profiles is disabled for this project');
    const denied = diagnostic.reason === 'permission_denied';
    throw new UnprocessableEntityException({
      statusCode: 422,
      error: denied ? 'PROFILE_PERMISSION_DENIED' : 'PROFILE_START_FAILED',
      message: denied
        ? 'Browser denied profiling permission. Ensure the monitored application HTML response allows profiling with Document-Policy: js-profiling, then reload the page. This diagnostic is based on the SDK failure; the server cannot inspect the document response header.'
        : 'Browser profiler failed to start. This does not confirm a missing Document-Policy header. Check browser support and profiler initialization.',
    });
  }
  async config(user: string, group: string, slug: string) {
    const project = await this.projects.findOwnedBySlug(user, group, slug);
    return { enabled: project.profilesEnabled, dsn: project.dsn };
  }
  async query(user: string, group: string, slug: string, input: ProfileQuery) {
    const q = new ProfileQueryPipe().transform(input);
    const project = await this.projects.findReadableBySlug(user, group, slug, 'project:profiles:read');
    const params: unknown[] = [project.id, q.start, q.end];
    const bind = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    let where =
      'project_id = $1 AND started_at >= $2::timestamptz AND started_at < $3::timestamptz';
    if (q.environment) where += ` AND environment = ${bind(q.environment)}`;
    if (q.search)
      where += ` AND strpos(lower(name), lower(${bind(q.search)}::text)) > 0`;
    if (q.traceId) where += ` AND trace_id = ${bind(q.traceId)}`;
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await manager.query("SET LOCAL statement_timeout = '5000ms'");
      const counts = await manager.query<{ total: string }[]>(
        `SELECT count(*)::text AS total FROM monitoring_profiles WHERE ${where}`,
        params,
      );
      const rows = await manager.query<ProfileSummary[]>(
        `SELECT profile_id AS "profileId", started_at AS "startedAt", duration_ms AS "durationMs", sample_interval_ms AS "sampleIntervalMs", name, environment, release, trace_id AS "traceId", span_id AS "spanId", truncated, sample_count AS "sampleCount" FROM monitoring_profiles WHERE ${where} ORDER BY started_at DESC, profile_id DESC LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
        params,
      );
      const items = rows.map((row) => ({
        ...row,
        startedAt: new Date(row.startedAt).toISOString(),
      }));
      return {
        items,
        total: Number(counts[0].total),
        page: q.page,
        pageSize: q.pageSize,
      };
    });
  }
  async overview(
    user: string,
    group: string,
    slug: string,
    input: ProfileQuery,
  ) {
    const q = new ProfileQueryPipe().transform(input);
    const project = await this.projects.findReadableBySlug(user, group, slug, 'project:profiles:read');
    const start = Date.parse(q.start);
    const previousStart = new Date(
      start - (Date.parse(q.end) - start),
    ).toISOString();
    const params: unknown[] = [project.id, previousStart, q.end];
    const bind = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    let where =
      'project_id = $1 AND started_at >= $2::timestamptz AND started_at < $3::timestamptz';
    if (q.environment) where += ` AND environment = ${bind(q.environment)}`;
    if (q.search)
      where += ` AND strpos(lower(name), lower(${bind(q.search)}::text)) > 0`;
    if (q.traceId) where += ` AND trace_id = ${bind(q.traceId)}`;
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await manager.query("SET LOCAL statement_timeout = '5000ms'");
      const [size] = await manager.query<
        { count: string; samples: string; bytes: string }[]
      >(
        `SELECT count(*)::text AS count, coalesce(sum(sample_count), 0)::text AS samples, coalesce(sum(octet_length(profile::text)), 0)::text AS bytes FROM monitoring_profiles WHERE ${where}`,
        params,
      );
      const message =
        'Too much profiling data to aggregate. Please narrow the time range or filters (maximum 2000 profiles, 2 million samples, 32 MB including comparison period).';
      if (
        Number(size?.count) > 2000 ||
        Number(size?.samples) > 2000000 ||
        Number(size?.bytes) > 32 * 1024 * 1024
      )
        throw new BadRequestException(message);
      const rows = await manager.query<
        { profile: MonitoringProfile; sampleCount: number }[]
      >(
        `SELECT profile, sample_count AS "sampleCount" FROM monitoring_profiles WHERE ${where} ORDER BY started_at DESC, profile_id DESC LIMIT 2001`,
        params,
      );
      if (rows.length > 2000) throw new BadRequestException(message);
      const current: MonitoringProfile[] = [],
        previous: MonitoringProfile[] = [];
      for (const row of rows)
        (Date.parse(row.profile.startedAt) >= start ? current : previous).push(
          row.profile,
        );
      return {
        ...buildProfileOverview(current, previous),
        comparisonStart: previousStart,
        comparisonEnd: q.start,
      };
    });
  }
  async detail(
    user: string,
    group: string,
    slug: string,
    profileId: string,
  ): Promise<MonitoringProfile> {
    if (!validProfileId(profileId))
      throw new BadRequestException('Invalid profileId');
    const project = await this.projects.findReadableBySlug(user, group, slug, 'project:profiles:read');
    const row = await this.dataSource.transaction(async (manager) => {
      await manager.query("SET LOCAL statement_timeout = '5000ms'");
      return manager.getRepository(ProfileEntity).findOneBy({
        projectId: project.id,
        profileId: profileId.toLowerCase(),
      });
    });
    if (!row) throw new NotFoundException('Profile not found');
    return row.profile;
  }
}



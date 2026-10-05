import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
import { contentHash } from '../traces/traces.service';
import { LogBatchEntity, LogEntity } from './log.entity';
import { LOG_LEVELS } from './logs-contract';
import type { LogQuery, LogsEnvelope } from './logs-contract';
import { LogQueryPipe, LogsEnvelopePipe } from './logs-validation';
@Injectable()
export class LogsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly projects: MonitoringProjectsService,
  ) {}
  async ingest(
    projectId: string,
    key: string | undefined,
    input: LogsEnvelope,
  ): Promise<void> {
    const envelope = new LogsEnvelopePipe().transform(input);
    const project = await this.projects.findForIngestion(projectId, key);
    if (!project.loggingEnabled)
      throw new ForbiddenException('Logs is disabled for this project');
    const hash = contentHash(envelope);
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`logs:${projectId}`],
      );
      const batches = manager.getRepository(LogBatchEntity);
      const previous = await batches.findOneBy({
        projectId,
        eventId: envelope.eventId,
      });
      if (previous) {
        if (previous.contentHash !== hash)
          throw new ConflictException(
            'Log batch ID reused with different content',
          );
        return;
      }
      const repository = manager.getRepository(LogEntity),
        receivedAt = new Date();
      for (const log of envelope.logs) {
        const logHash = contentHash(log);
        const existing = await repository.findOneBy({
          projectId,
          logId: log.logId,
        });
        if (existing) {
          if (existing.contentHash !== logHash)
            throw new ConflictException('Log ID reused with different content');
          continue;
        }
        await repository.insert({
          ...log,
          timestamp: new Date(log.timestamp),
          projectId,
          contentHash: logHash,
          receivedAt,
        });
      }
      await batches.insert({
        projectId,
        eventId: envelope.eventId,
        contentHash: hash,
        receivedAt,
      });
    });
  }
  async fields(user: string, group: string, slug: string) {
    const project = await this.projects.findOwnedBySlug(user, group, slug);
    return this.dataSource.transaction(async (manager) => {
      await manager.query("SET LOCAL statement_timeout = '5000ms'");
      const rows = await manager.query<{ key: string }[]>(
        `SELECT DISTINCT key FROM monitoring_logs CROSS JOIN LATERAL jsonb_object_keys(attributes) AS key WHERE project_id = $1 AND timestamp >= now() - interval '7 days' ORDER BY key LIMIT 101`,
        [project.id],
      );
      return {
        attributes: rows.slice(0, 100).map((row) => row.key),
        truncated: rows.length > 100,
        levels: LOG_LEVELS,
        enabled: project.loggingEnabled,
        dsn: project.dsn,
      };
    });
  }
  async query(user: string, group: string, slug: string, input: LogQuery) {
    const q = new LogQueryPipe().transform(input);
    const project = await this.projects.findOwnedBySlug(user, group, slug);
    const params: unknown[] = [project.id, q.start, q.end];
    const bind = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    let where =
      'project_id = $1 AND timestamp >= $2::timestamptz AND timestamp < $3::timestamptz';
    if (q.search)
      where += ` AND strpos(lower(message), lower(${bind(q.search)}::text)) > 0`;
    if (q.levels.length) where += ` AND level = ANY(${bind(q.levels)}::text[])`;
    if (q.environment) where += ` AND environment = ${bind(q.environment)}`;
    if (q.traceId) where += ` AND trace_id = ${bind(q.traceId)}`;
    for (const f of q.filters)
      where += ` AND attributes -> ${bind(f.key)}::text = ${bind(JSON.stringify(f.value))}::jsonb`;
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await manager.query("SET LOCAL statement_timeout = '5000ms'");
      const counts = await manager.query<{ total: number }[]>(
        `SELECT count(*)::int AS total FROM (SELECT 1 FROM monitoring_logs WHERE ${where} LIMIT 100001) bounded`,
        params,
      );
      const total = counts[0].total;
      if (total > 100000)
        throw new BadRequestException('Too many logs; narrow range or filters');
      const direction = q.sortDirection === 'asc' ? 'ASC' : 'DESC';
      const items = await manager.query<Record<string, unknown>[]>(
        `SELECT log_id AS "logId", timestamp, level, message, attributes, environment, release, trace_id AS "traceId", span_id AS "spanId" FROM monitoring_logs WHERE ${where} ORDER BY timestamp ${direction}, log_id ${direction} LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
        params,
      );
      const intervalMs = q.intervalSeconds * 1000;
      const bucket = `floor((extract(epoch FROM timestamp) * 1000 - ${Date.parse(q.start)}) / ${intervalMs})::int`;
      const rows = await manager.query<
        { bucket: number; level: string; count: number }[]
      >(
        `SELECT ${bucket} AS bucket, level, count(*)::int AS count FROM monitoring_logs WHERE ${where} GROUP BY 1, 2 ORDER BY 1`,
        params,
      );
      const lookup = new Map(
        rows.map((row) => [`${row.level}:${row.bucket}`, row.count]),
      );
      return {
        items,
        total,
        page: q.page,
        pageSize: q.pageSize,
        intervalMs,
        series: (q.levels.length ? q.levels : LOG_LEVELS).map((level) => ({
          level,
          points: Array.from(
            {
              length: Math.ceil(
                (Date.parse(q.end) - Date.parse(q.start)) / intervalMs,
              ),
            },
            (_, index) => ({
              timestamp: new Date(
                Date.parse(q.start) + index * intervalMs,
              ).toISOString(),
              count: lookup.get(`${level}:${index}`) ?? 0,
            }),
          ),
        })),
      };
    });
  }
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
import { contentHash } from '../traces/traces.service';
import { MetricBatchEntity, MetricEntity } from './metric.entity';
import { MetricQuery, MetricsEnvelope } from './metrics-contract';
import { MetricQueryPipe, MetricsEnvelopePipe } from './metrics-validation';

@Injectable()
export class MetricsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly projects: MonitoringProjectsService,
  ) {}
  async ingest(
    projectId: string,
    key: string | undefined,
    input: MetricsEnvelope,
  ) {
    const envelope = new MetricsEnvelopePipe().transform(input);
    const project = await this.projects.findForIngestion(projectId, key);
    if (!project.metricsEnabled)
      throw new ForbiddenException('Metrics is disabled for this project');
    const hash = contentHash(envelope);
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`metrics:${projectId}`],
      );
      const batches = manager.getRepository(MetricBatchEntity);
      const previous = await batches.findOneBy({
        projectId,
        eventId: envelope.eventId,
      });
      if (previous) {
        if (previous.contentHash !== hash)
          throw new ConflictException(
            'Metric batch ID reused with different content',
          );
        return;
      }
      const receivedAt = new Date();
      await manager.getRepository(MetricEntity).insert(
        envelope.samples.map((sample, sampleIndex) => ({
          ...sample,
          timestamp: new Date(sample.timestamp),
          projectId,
          eventId: envelope.eventId,
          sampleIndex,
          receivedAt,
        })),
      );
      await batches.insert({
        projectId,
        eventId: envelope.eventId,
        contentHash: hash,
        receivedAt,
      });
    });
  }
  async catalog(user: string, group: string, slug: string) {
    const project = await this.projects.findOwnedBySlug(user, group, slug);
    return this.dataSource.transaction(async (manager) => {
      await manager.query("SET LOCAL statement_timeout = '5000ms'");
      const items = await manager.query<
        {
          name: string;
          type: string;
          unit: string;
          sampleCount: number;
          lastSeen: string;
        }[]
      >(
        `SELECT name, type, unit, count(*)::int AS "sampleCount", max(timestamp) AS "lastSeen" FROM monitoring_metrics WHERE project_id = $1 AND timestamp >= now() - interval '7 days' GROUP BY name, type, unit ORDER BY name, type, unit LIMIT 201`,
        [project.id],
      );
      const attributes = await manager.query<{ key: string }[]>(
        `SELECT DISTINCT key FROM monitoring_metrics CROSS JOIN LATERAL jsonb_object_keys(attributes) AS key WHERE project_id = $1 AND timestamp >= now() - interval '7 days' ORDER BY key LIMIT 100`,
        [project.id],
      );
      return {
        items: items.slice(0, 200),
        truncated: items.length > 200,
        attributes: attributes.map((row) => row.key),
        enabled: project.metricsEnabled,
      };
    });
  }
  async query(user: string, group: string, slug: string, input: MetricQuery) {
    const q = new MetricQueryPipe().transform(input);
    const project = await this.projects.findOwnedBySlug(user, group, slug);
    const params: unknown[] = [
      project.id,
      q.start,
      q.end,
      q.name,
      q.type,
      q.unit,
    ];
    const bind = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    let where =
      'project_id = $1 AND timestamp >= $2::timestamptz AND timestamp < $3::timestamptz AND name = $4 AND type = $5 AND unit = $6';
    if (q.environment !== undefined)
      where += ` AND environment = ${bind(q.environment)}`;
    for (const filter of q.filters)
      where += ` AND attributes -> ${bind(filter.key)}::text = ${bind(JSON.stringify(filter.value))}::jsonb`;
    const groupSql = q.groupBy
      ? `attributes -> ${bind(q.groupBy)}::text`
      : '\'"all"\'::jsonb';
    const aggregates = {
      sum: 'sum(value)',
      avg: 'avg(value)',
      min: 'min(value)',
      max: 'max(value)',
      count: 'count(*)::double precision',
      p50: 'percentile_cont(0.5) WITHIN GROUP (ORDER BY value)',
      p95: 'percentile_cont(0.95) WITHIN GROUP (ORDER BY value)',
      p99: 'percentile_cont(0.99) WITHIN GROUP (ORDER BY value)',
      last: '(array_agg(value ORDER BY timestamp DESC, event_id DESC, sample_index DESC))[1]',
    };
    const aggregate = aggregates[q.aggregation];
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await manager.query("SET LOCAL statement_timeout = '5000ms'");
      const bounded = await manager.query<{ total: number }[]>(
        `SELECT count(*)::int AS total FROM (SELECT 1 FROM monitoring_metrics WHERE ${where} LIMIT 100001) bounded`,
        params.slice(0, q.groupBy ? -1 : undefined),
      );
      const total = bounded[0].total;
      if (total > 100000)
        throw new BadRequestException(
          'Too many metric samples; narrow range or filters',
        );
      const rows = await manager.query<
        { groupValue: unknown; value: number; sampleCount: number }[]
      >(
        `SELECT ${groupSql} AS "groupValue", ${aggregate} AS value, count(*)::int AS "sampleCount" FROM monitoring_metrics WHERE ${where} GROUP BY 1 ORDER BY "sampleCount" DESC, "groupValue" LIMIT 21`,
        params,
      );
      const groups = rows.slice(0, 20);
      const intervalMs = q.intervalSeconds * 1000;
      const bucket = `floor((extract(epoch FROM timestamp) * 1000 - ${Date.parse(q.start)}) / ${intervalMs})::int`;
      const selected = groups.map((row) =>
        JSON.stringify(row.groupValue ?? null),
      );
      const seriesParams = [...params, selected];
      const points = selected.length
        ? await manager.query<
            {
              bucket: number;
              groupValue: unknown;
              value: number;
              sampleCount: number;
            }[]
          >(
            `SELECT ${bucket} AS bucket, ${groupSql} AS "groupValue", ${aggregate} AS value, count(*)::int AS "sampleCount" FROM monitoring_metrics WHERE ${where} AND coalesce(${groupSql}, 'null'::jsonb) = ANY($${seriesParams.length}::jsonb[]) GROUP BY 1, 2 ORDER BY 1`,
            seriesParams,
          )
        : [];
      const pointMap = new Map(
        points.map((p) => [
          `${JSON.stringify(p.groupValue ?? null)}:${p.bucket}`,
          p,
        ]),
      );
      const samples = await manager.query<Record<string, unknown>[]>(
        `SELECT event_id AS "eventId", sample_index AS "sampleIndex", name, type, unit, value, timestamp, attributes, environment, release, trace_id AS "traceId", span_id AS "spanId" FROM monitoring_metrics WHERE ${where} ORDER BY timestamp DESC, event_id DESC, sample_index DESC LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
        params.slice(0, q.groupBy ? -1 : undefined),
      );
      return {
        total,
        page: q.page,
        pageSize: q.pageSize,
        samples,
        aggregates: groups,
        truncatedGroups: rows.length > 20,
        intervalMs,
        series: groups.map((row) => ({
          groupValue: row.groupValue,
          points: Array.from(
            {
              length: Math.ceil(
                (Date.parse(q.end) - Date.parse(q.start)) / intervalMs,
              ),
            },
            (_, index) => {
              const point = pointMap.get(
                `${JSON.stringify(row.groupValue ?? null)}:${index}`,
              );
              return {
                timestamp: new Date(
                  Date.parse(q.start) + index * intervalMs,
                ).toISOString(),
                value: point?.value ?? null,
                sampleCount: point?.sampleCount ?? 0,
              };
            },
          ),
        })),
      };
    });
  }
}

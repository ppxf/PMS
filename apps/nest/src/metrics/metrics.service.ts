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
import {
  MetricQuery,
  MetricsEnvelope,
  TraceMetricsQuery,
} from './metrics-contract';
import {
  MetricQueryPipe,
  MetricsEnvelopePipe,
  TraceMetricsQueryPipe,
} from './metrics-validation';
import { validId } from '../traces/traces-validation';
import { isIP } from 'node:net';
import { METRIC_GROUP_FIELDS } from './metrics-contract';
import {
  METRIC_FILTER_FIELDS,
  metricFieldOperators,
  metricFilterField,
} from './metrics-fields';

const sampleColumns =
  'event_id AS "eventId", sample_index AS "sampleIndex", name, type, unit, value, timestamp, attributes, environment, release, trace_id AS "traceId", span_id AS "spanId"';

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
    clientAddress?: string,
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
          attributes: {
            ...Object.fromEntries(
              Object.entries(sample.attributes).filter(
                ([key]) => key !== 'client.address',
              ),
            ),
            ...(clientAddress && isIP(clientAddress)
              ? { 'client.address': clientAddress }
              : {}),
          },
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
      const attributes = await manager.query<
        { key: string; types: string[] }[]
      >(
        `SELECT attribute.key, array_agg(DISTINCT jsonb_typeof(attribute.val)) AS types FROM monitoring_metrics CROSS JOIN LATERAL jsonb_each(attributes) AS attribute(key, val) WHERE project_id = $1 AND timestamp >= now() - interval '7 days' GROUP BY attribute.key ORDER BY attribute.key LIMIT 101`,
        [project.id],
      );
      return {
        items: items.slice(0, 200),
        truncated: items.length > 200,
        attributes: attributes.slice(0, 100).map((row) => row.key),
        groupFields: [
          ...METRIC_GROUP_FIELDS,
          ...attributes
            .slice(0, 100)
            .filter(
              (row) =>
                ['value', 'project'].includes(row.key) ||
                !METRIC_GROUP_FIELDS.some((field) => field.key === row.key),
            )
            .map((row) => ({
              key: `attributes.${row.key}`,
              label: ['value', 'project'].includes(row.key)
                ? `attributes.${row.key}`
                : row.key,
              type: row.types?.length === 1 ? row.types[0] : 'mixed',
            })),
        ],
        filterFields: [
          ...METRIC_FILTER_FIELDS.map(({ key, label, type, operators }) => ({
            key,
            label,
            type,
            operators,
          })),
          ...attributes
            .slice(0, 100)
            .filter(
              (row) =>
                !METRIC_GROUP_FIELDS.some(
                  (field) =>
                    field.key === row.key &&
                    !['value', 'project'].includes(field.key),
                ),
            )
            .map((row) => {
              const type =
                row.types?.length === 1 &&
                ['string', 'number', 'boolean'].includes(row.types[0])
                  ? (row.types[0] as 'string' | 'number' | 'boolean')
                  : 'mixed';
              return {
                key: `attributes.${row.key}`,
                label: `attributes.${row.key}`,
                type,
                operators: metricFieldOperators(type),
              };
            }),
        ],
        truncatedAttributes: attributes.length > 100,
        enabled: project.metricsEnabled,
      };
    });
  }
  async forTrace(
    user: string,
    group: string,
    slug: string,
    traceId: string,
    input: TraceMetricsQuery,
  ) {
    if (!validId(traceId, 32)) throw new BadRequestException('Invalid traceId');
    const q = new TraceMetricsQueryPipe().transform(input);
    const project = await this.projects.findOwnedBySlug(user, group, slug);
    const params: unknown[] = [project.id, traceId];
    let where = 'project_id = $1 AND trace_id = $2';
    if (q.spanId !== undefined) {
      params.push(q.spanId);
      where += ` AND span_id = $${params.length}`;
    }
    if (q.search !== undefined) {
      params.push(q.search);
      where += ` AND strpos(lower(name), lower($${params.length}::text)) > 0`;
    }
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await manager.query("SET LOCAL statement_timeout = '5000ms'");
      const counts = await manager.query<{ total: number }[]>(
        `SELECT count(*)::int AS total FROM monitoring_metrics WHERE ${where}`,
        params,
      );
      const samples = await manager.query<Record<string, unknown>[]>(
        `SELECT ${sampleColumns} FROM monitoring_metrics WHERE ${where} ORDER BY timestamp DESC, event_id DESC, sample_index DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, q.pageSize, (q.page - 1) * q.pageSize],
      );
      return {
        total: counts[0].total,
        page: q.page,
        pageSize: q.pageSize,
        samples,
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
    if (q.traceId !== undefined) where += ` AND trace_id = ${bind(q.traceId)}`;
    if (q.spanId !== undefined) where += ` AND span_id = ${bind(q.spanId)}`;
    for (const filter of q.filters) {
      const field = metricFilterField(filter.field)!;
      const expression = field.column
        ? `to_jsonb(${field.column})`
        : field.key === 'project'
          ? `to_jsonb(${bind(project.slug ?? slug)}::text)`
          : `NULLIF(attributes -> ${bind(field.attribute)}::text, 'null'::jsonb)`;
      if (filter.operator === 'exists')
        where += ` AND ${expression} IS ${filter.value === false ? '' : 'NOT '}NULL`;
      else if (filter.operator === 'in' || filter.operator === 'not_in') {
        const values = filter.value as (string | number | boolean)[];
        const membership = `${expression} ${filter.operator === 'not_in' ? 'NOT ' : ''}IN (${values.map((value) => `${bind(JSON.stringify(value))}::jsonb`).join(', ')})`;
        where += ` AND ${filter.operator === 'not_in' ? `(${expression} IS NULL OR ${membership})` : membership}`;
      } else if (filter.operator === 'contains') {
        where += ` AND strpos(CASE WHEN jsonb_typeof(${expression}) = 'string' THEN ${expression} #>> '{}' END, ${bind(filter.value)}) > 0`;
      } else if (filter.operator === 'eq')
        where += ` AND ${expression} = ${bind(JSON.stringify(filter.value))}::jsonb`;
      else {
        const operators = { gt: '>', gte: '>=', lt: '<', lte: '<=' };
        where += ` AND (CASE WHEN jsonb_typeof(${expression}) = 'number' THEN (${expression} #>> '{}')::double precision END) ${operators[filter.operator]} ${bind(filter.value)}`;
      }
    }
    const scopeParams = [...params];
    const fields =
      typeof q.groupBy === 'string' ? [q.groupBy] : (q.groupBy ?? []);
    const groupExpressions = fields.map((field) => {
      if (field === 'value') return 'to_jsonb(value)';
      if (field === 'project')
        return `to_jsonb(${bind(project.slug ?? slug)}::text)`;
      return `attributes -> ${bind(field.startsWith('attributes.') ? field.slice(11) : field)}::text`;
    });
    const groupSql =
      groupExpressions.length > 1
        ? `jsonb_build_array(${groupExpressions.join(', ')})`
        : (groupExpressions[0] ?? '\'"all"\'::jsonb');
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
        scopeParams,
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
        `SELECT ${sampleColumns} FROM monitoring_metrics WHERE ${where} ORDER BY timestamp DESC, event_id DESC, sample_index DESC LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
        scopeParams,
      );
      return {
        total,
        page: q.page,
        pageSize: q.pageSize,
        samples,
        aggregates: groups,
        truncatedGroups: rows.length > 20,
        intervalMs,
        aggregation: q.aggregation,
        unit: q.aggregation === 'count' ? 'none' : q.unit,
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

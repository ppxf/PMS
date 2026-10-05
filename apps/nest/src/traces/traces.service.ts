import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
import { MonitoringSpanEntity } from './entities/monitoring-span.entity';
import { TraceIngestBatch } from './entities/trace-ingest-batch.entity';
import {
  HTTP_FAILED_SQL,
  HTTP_SUCCEEDED_SQL,
  MonitoringSpan,
  SPAN_FIELDS,
  SPAN_FIELD_MAP,
  SpanQuery,
  TransactionEnvelope,
} from './traces-contract';
import {
  SpanQueryPipe,
  TransactionEnvelopePipe,
  validId,
} from './traces-validation';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function contentHash(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

interface MetricRow {
  groupValues: unknown[];
  groupKey: string;
  [key: string]: unknown;
}
interface SqlScope {
  where: string;
  parameters: unknown[];
}

@Injectable()
export class TracesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly projects: MonitoringProjectsService,
  ) {}

  async ingest(
    projectId: string,
    publicKey: string | undefined,
    input: TransactionEnvelope,
  ): Promise<void> {
    const envelope = new TransactionEnvelopePipe().transform(input);
    const project = await this.projects.findForIngestion(projectId, publicKey);
    if (!project.tracingEnabled)
      throw new ForbiddenException('Tracing is disabled for this project');
    const payloadHash = contentHash(envelope);
    const receivedAt = new Date();
    await this.dataSource.transaction(async (manager) => {
      // A project-scoped transaction lock serializes overlapping batches and span IDs.
      // INSERT uniqueness remains the final safety net; no partial acceptance is possible.
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [projectId],
      );
      const batches = manager.getRepository(TraceIngestBatch);
      const existing = await batches.findOneBy({
        projectId,
        eventId: envelope.transaction.eventId,
      });
      if (existing) {
        if (existing.payloadHash !== payloadHash)
          throw new ConflictException(
            'Batch eventId was reused with different content',
          );
        return;
      }
      const spans = manager.getRepository(MonitoringSpanEntity);
      for (const span of envelope.transaction.spans) {
        const hash = contentHash(span);
        const previous = await spans.findOneBy({
          projectId,
          traceId: span.traceId,
          spanId: span.spanId,
        });
        if (previous) {
          if (previous.contentHash !== hash)
            throw new ConflictException(
              'Span ID was reused with different content',
            );
          continue;
        }
        await spans.insert({
          ...span,
          projectId,
          startTime: new Date(span.startTime),
          endTime: new Date(span.endTime),
          contentHash: hash,
          receivedAt,
        });
      }
      await batches.insert({
        projectId,
        eventId: envelope.transaction.eventId,
        payloadHash,
        receivedAt,
      });
    });
  }

  async fields(userId: string, groupSlug: string, projectSlug: string) {
    await this.projects.findOwnedBySlug(userId, groupSlug, projectSlug);
    return SPAN_FIELDS.map((field) => ({
      name: field.name,
      type: field.type,
      unit: field.unit,
      groupable: field.groupable,
      operators: field.operators,
      aggregations: field.aggregations,
    }));
  }

  private scope(projectId: string, query: SpanQuery): SqlScope {
    const parameters: unknown[] = [projectId, query.start, query.end];
    const clauses = [
      'project_id = $1',
      'start_time >= $2::timestamptz',
      'start_time < $3::timestamptz',
    ];
    const bind = (value: unknown) => {
      parameters.push(value);
      return `$${parameters.length}`;
    };
    for (const filter of query.filters) {
      const column = `(${SPAN_FIELD_MAP.get(filter.field)!.sql})`;
      if (filter.operator === 'exists')
        clauses.push(
          `${column} IS ${filter.value === false ? '' : 'NOT '}NULL`,
        );
      else if (filter.operator === 'in' || filter.operator === 'not_in') {
        const values = filter.value as unknown[];
        const membership = `${column} ${filter.operator === 'not_in' ? 'NOT ' : ''}IN (${values.map(bind).join(', ')})`;
        clauses.push(
          filter.operator === 'not_in'
            ? `(${column} IS NULL OR ${membership})`
            : membership,
        );
      } else if (filter.operator === 'contains') {
        // strpos treats wildcards as literal text rather than hidden LIKE patterns.
        clauses.push(`strpos(${column}, ${bind(filter.value)}) > 0`);
      } else {
        const operators = { eq: '=', gt: '>', gte: '>=', lt: '<', lte: '<=' };
        clauses.push(
          `${column} ${operators[filter.operator]} ${bind(filter.value)}`,
        );
      }
    }
    return { where: clauses.join(' AND '), parameters };
  }

  private async read<T>(
    userId: string,
    groupSlug: string,
    projectSlug: string,
    input: SpanQuery,
    action: (
      manager: EntityManager,
      query: SpanQuery,
      scope: SqlScope,
      sampleCount: number,
    ) => Promise<T>,
  ): Promise<T> {
    const query = new SpanQueryPipe().transform(input);
    const project = await this.projects.findOwnedBySlug(
      userId,
      groupSlug,
      projectSlug,
    );
    const scope = this.scope(project.id, query);
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await manager.query("SET LOCAL statement_timeout = '5000ms'");
      const rows = await manager.query<{ count: string }[]>(
        `SELECT count(*)::text AS count FROM (SELECT 1 FROM monitoring_spans WHERE ${scope.where} LIMIT 100001) bounded`,
        scope.parameters,
      );
      const count = Number(rows[0].count);
      if (count > 100000)
        throw new BadRequestException(
          'Query matches too many spans; narrow the time range or filters',
        );
      return action(manager, query, scope, count);
    });
  }

  samples(
    userId: string,
    groupSlug: string,
    projectSlug: string,
    input: SpanQuery,
  ) {
    return this.read(
      userId,
      groupSlug,
      projectSlug,
      input,
      async (manager, query, scope, total) => {
        if (typeof query.sortBy === 'number')
          throw new BadRequestException(
            'Samples sortBy must be startTime or durationMs',
          );
        const sort =
          query.sortBy === 'durationMs' ? 'duration_ms' : 'start_time';
        const direction = query.sortDirection === 'asc' ? 'ASC' : 'DESC';
        const rows = await manager.query<Record<string, unknown>[]>(
          `SELECT * FROM monitoring_spans WHERE ${scope.where} ORDER BY ${sort} ${direction}, trace_id, span_id LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
          scope.parameters,
        );
        return {
          items: rows.map((row) => this.toSpan(row)),
          total,
          page: query.page,
          pageSize: query.pageSize,
        };
      },
    );
  }

  private metricSql(query: SpanQuery): string {
    return query.metrics
      .map((metric, index) => {
        const field = SPAN_FIELD_MAP.get(metric.field)!;
        let expression: string;
        let count: string;
        if (metric.function === 'count') {
          expression = 'count(*)';
          count = 'count(*)';
        } else if (metric.function === 'errorRate') {
          const denominator = `count(*) FILTER (WHERE (${HTTP_FAILED_SQL}) OR (${HTTP_SUCCEEDED_SQL}))`;
          expression = `(count(*) FILTER (WHERE ${HTTP_FAILED_SQL}))::double precision / NULLIF(${denominator}, 0)`;
          count = denominator;
        } else {
          const eligibility = `${field.sql} IS NOT NULL AND truncated = false AND (op <> 'http.client' OR status IN ('ok', 'error'))`;
          expression =
            metric.function === 'avg'
              ? `avg(${field.sql}) FILTER (WHERE ${eligibility})`
              : `percentile_cont(${metric.function === 'p50' ? '0.5' : '0.95'}) WITHIN GROUP (ORDER BY ${field.sql}) FILTER (WHERE ${eligibility})`;
          count = `count(*) FILTER (WHERE ${eligibility})`;
        }
        return `${expression} AS m${index}, ${count} AS n${index}`;
      })
      .join(', ');
  }

  private groupsSql(query: SpanQuery): { expression: string; group: string } {
    const columns = query.groupBy.map(
      (name) => `(${SPAN_FIELD_MAP.get(name)!.sql})`,
    );
    return {
      expression: columns.length
        ? `jsonb_build_array(${columns.join(', ')})`
        : "'[]'::jsonb",
      group: columns.length ? `GROUP BY ${columns.join(', ')}` : '',
    };
  }

  private async rankedGroups(
    manager: EntityManager,
    query: SpanQuery,
    scope: SqlScope,
  ): Promise<MetricRow[]> {
    if (
      query.metrics.some((metric) => metric.function === 'errorRate') &&
      query.filters.some((filter) =>
        [
          'span.status',
          'span.truncated',
          'http.status_code',
          'http.status_class',
        ].includes(filter.field),
      )
    )
      throw new BadRequestException(
        'errorRate cannot prefilter request outcome',
      );
    const groups = this.groupsSql(query);
    // Rank on whole-range raw values, never on averaged bucket percentiles.
    return manager.query<MetricRow[]>(
      `SELECT "groupValues", "groupValues"::text AS "groupKey", ${query.metrics.map((_, index) => `m${index}, n${index}`).join(', ')} FROM (SELECT ${groups.expression} AS "groupValues", ${this.metricSql(query)} FROM monitoring_spans WHERE ${scope.where} ${groups.group}) metrics WHERE m${query.primaryMetric} IS NOT NULL ORDER BY m${query.primaryMetric} DESC, "groupValues"::text ASC LIMIT ${query.limit}`,
      scope.parameters,
    );
  }

  aggregates(
    userId: string,
    groupSlug: string,
    projectSlug: string,
    input: SpanQuery,
  ) {
    return this.read(
      userId,
      groupSlug,
      projectSlug,
      input,
      async (manager, query, scope, sampleCount) => {
        const groups = await this.rankedGroups(manager, query, scope);
        const metricIndex =
          typeof query.sortBy === 'number' ? query.sortBy : query.primaryMetric;
        if (typeof query.sortBy === 'string')
          throw new BadRequestException(
            'Aggregates sortBy must be a metric index',
          );
        const direction = query.sortDirection === 'asc' ? 1 : -1;
        groups.sort((a, b) => {
          const av = a[`m${metricIndex}`];
          const bv = b[`m${metricIndex}`];
          if (av === null && bv !== null) return 1;
          if (bv === null && av !== null) return -1;
          return (
            direction * (Number(av) - Number(bv)) ||
            a.groupKey.localeCompare(b.groupKey)
          );
        });
        return {
          items: groups.map((row) => ({
            groupKey: row.groupKey,
            groupValues: row.groupValues,
            values: query.metrics.map((_, index) =>
              row[`m${index}`] === null ? null : Number(row[`m${index}`]),
            ),
            sampleCounts: query.metrics.map((_, index) =>
              Number(row[`n${index}`]),
            ),
          })),
          sampleCount,
        };
      },
    );
  }

  timeseries(
    userId: string,
    groupSlug: string,
    projectSlug: string,
    input: SpanQuery,
  ) {
    return this.read(
      userId,
      groupSlug,
      projectSlug,
      input,
      async (manager, query, scope, sampleCount) => {
        const intervalMs = this.interval(query);
        const start = Date.parse(query.start);
        const end = Date.parse(query.end);
        if (Math.ceil((end - start) / intervalMs) > 500)
          throw new BadRequestException('Interval produces too many buckets');
        const selected = await this.rankedGroups(manager, query, scope);
        const groups = this.groupsSql(query);
        const parameters = [
          ...scope.parameters,
          intervalMs / 1000,
          JSON.stringify(selected.map((row) => row.groupValues)),
        ];
        const intervalParameter = `$${scope.parameters.length + 1}`;
        const selectedParameter = `$${scope.parameters.length + 2}`;
        const bucket = `floor((extract(epoch from start_time) - extract(epoch from $2::timestamptz)) / ${intervalParameter})::integer`;
        const groupClause = groups.group
          ? `${groups.group}, ${bucket}`
          : `GROUP BY ${bucket}`;
        const rows = selected.length
          ? await manager.query<MetricRow[]>(
              `SELECT ${bucket} AS bucket, ${groups.expression}::text AS "groupKey", ${this.metricSql(query)} FROM monitoring_spans WHERE ${scope.where} AND ${groups.expression} IN (SELECT value FROM jsonb_array_elements(${selectedParameter}::jsonb)) ${groupClause}`,
              parameters,
            )
          : [];
        const byBucket = new Map(
          rows.map((row) => [`${row.groupKey}:${String(row.bucket)}`, row]),
        );
        const series = selected.flatMap((group) =>
          query.metrics.map((metric, metricIndex) => ({
            groupKey: group.groupKey,
            metricIndex,
            points: Array.from(
              { length: Math.ceil((end - start) / intervalMs) },
              (_, bucketIndex) => {
                const row = byBucket.get(`${group.groupKey}:${bucketIndex}`);
                const value = row?.[`m${metricIndex}`];
                return {
                  timestamp: new Date(
                    start + bucketIndex * intervalMs,
                  ).toISOString(),
                  value:
                    value === undefined || value === null
                      ? metric.function === 'count'
                        ? 0
                        : null
                      : Number(value),
                  sampleCount: row ? Number(row[`n${metricIndex}`]) : 0,
                };
              },
            ),
          })),
        );
        return {
          intervalMs,
          groups: selected.map((row) => ({
            key: row.groupKey,
            values: row.groupValues,
          })),
          series,
          sampleCount,
        };
      },
    );
  }

  private interval(query: SpanQuery): number {
    if (query.interval && query.interval !== 'auto')
      return {
        '1m': 60000,
        '30m': 1800000,
        '1h': 3600000,
        '3h': 10800000,
        '6h': 21600000,
        '1d': 86400000,
      }[query.interval];
    const range = Date.parse(query.end) - Date.parse(query.start);
    if (range <= 3 * 3600000) return 60000;
    if (range <= 2 * 24 * 3600000) return 1800000;
    return 3600000;
  }

  traceSamples(
    userId: string,
    groupSlug: string,
    projectSlug: string,
    input: SpanQuery,
  ) {
    return this.read(
      userId,
      groupSlug,
      projectSlug,
      input,
      async (manager, query, scope) => {
        if (typeof query.sortBy === 'number')
          throw new BadRequestException(
            'Trace samples sortBy must be startTime or durationMs',
          );
        // Only trace selection inherits span filters. Display summaries cover the retained trace.
        const matched = `SELECT DISTINCT trace_id FROM monitoring_spans WHERE ${scope.where}`;
        const totals = await manager.query<{ total: string }[]>(
          `SELECT count(*)::text AS total FROM (${matched}) matched`,
          scope.parameters,
        );
        const sort =
          query.sortBy === 'durationMs' ? '"durationMs"' : '"startTime"';
        const direction = query.sortDirection === 'asc' ? 'ASC' : 'DESC';
        const rows = await manager.query<Record<string, unknown>[]>(
          `SELECT trace_id AS "traceId", min(start_time) AS "startTime", max(end_time) AS "endTime", count(*)::integer AS "spanCount", COALESCE(max(duration_ms) FILTER (WHERE is_transaction), max(duration_ms)) AS "durationMs", bool_or(truncated OR dropped_span_count > 0) AS truncated FROM monitoring_spans WHERE project_id = $1 AND trace_id IN (${matched}) GROUP BY trace_id ORDER BY ${sort} ${direction}, trace_id LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
          scope.parameters,
        );
        return {
          items: rows,
          total: Number(totals[0].total),
          page: query.page,
          pageSize: query.pageSize,
        };
      },
    );
  }

  async detail(
    userId: string,
    groupSlug: string,
    projectSlug: string,
    traceId: string,
    cursor?: string,
  ) {
    if (!validId(traceId, 32)) throw new BadRequestException('Invalid traceId');
    const project = await this.projects.findOwnedBySlug(
      userId,
      groupSlug,
      projectSlug,
    );
    const parameters: unknown[] = [project.id, traceId];
    let continuation = '';
    if (cursor !== undefined) {
      try {
        if (cursor.length > 256 || !/^[A-Za-z0-9_-]+$/.test(cursor))
          throw new Error();
        const decoded = JSON.parse(
          Buffer.from(cursor, 'base64url').toString('utf8'),
        ) as { time: string; spanId: string; traceId: string };
        if (
          typeof decoded.time !== 'string' ||
          !Number.isFinite(Date.parse(decoded.time)) ||
          !validId(decoded.spanId, 16) ||
          decoded.traceId !== traceId
        )
          throw new Error();
        // Include the retained row's raw PostgreSQL timestamp, preserving microseconds.
        parameters.push(decoded.time, decoded.spanId);
        continuation = 'AND (start_time, span_id) > ($3::timestamptz, $4)';
      } catch {
        throw new BadRequestException('Invalid trace cursor');
      }
    }
    const rows = await this.dataSource.transaction(async (manager) => {
      await manager.query("SET LOCAL statement_timeout = '5000ms'");
      return manager.query<Record<string, unknown>[]>(
        `SELECT *, start_time::text AS cursor_time FROM monitoring_spans WHERE project_id = $1 AND trace_id = $2 ${continuation} ORDER BY start_time, span_id LIMIT 1001`,
        parameters,
      );
    });
    const hasMore = rows.length > 1000;
    const visible = rows.slice(0, 1000);
    const last = visible.at(-1);
    return {
      items: visible.map((row) => this.toSpan(row)),
      hasMore,
      ...(hasMore && last
        ? {
            nextCursor: Buffer.from(
              JSON.stringify({
                time: last.cursor_time,
                spanId: last.span_id,
                traceId,
              }),
            ).toString('base64url'),
          }
        : {}),
    };
  }

  private toSpan(row: Record<string, unknown>): MonitoringSpan {
    const map: Record<string, string> = {
      trace_id: 'traceId',
      span_id: 'spanId',
      parent_span_id: 'parentSpanId',
      is_transaction: 'isTransaction',
      start_time: 'startTime',
      end_time: 'endTime',
      duration_ms: 'durationMs',
      page_route: 'pageRoute',
      http_method: 'httpMethod',
      http_status_code: 'httpStatusCode',
      http_route: 'httpRoute',
      ttfb_ms: 'ttfbMs',
      transfer_size: 'transferSize',
      encoded_body_size: 'encodedBodySize',
      decoded_body_size: 'decodedBodySize',
      end_reason: 'endReason',
      dropped_span_count: 'droppedSpanCount',
    };
    const omitted = new Set([
      'project_id',
      'content_hash',
      'received_at',
      'cursor_time',
    ]);
    return Object.fromEntries(
      Object.entries(row)
        .filter(([key, value]) => !omitted.has(key) && value !== null)
        .map(([key, value]) => [
          map[key] ?? key,
          value instanceof Date ? value.toISOString() : value,
        ]),
    ) as unknown as MonitoringSpan;
  }
}

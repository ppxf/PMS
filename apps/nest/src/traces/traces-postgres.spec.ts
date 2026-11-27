import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Baseline1793577600000 } from '../database/migrations/1793577600000-baseline';
import { ErrorTraceIndex1795737600000 } from '../database/migrations/1795737600000-error-trace-index';
import { Group } from '../groups/entities/group.entity';
import { MonitoringProject } from '../monitoring-projects/entities/monitoring-project.entity';
import { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
import { User } from '../users/entities/user.entity';
import { MonitoringSpanEntity } from './entities/monitoring-span.entity';
import { TraceIngestBatch } from './entities/trace-ingest-batch.entity';
import { SpanQueryPipe } from './traces-validation';
import { transactionFixture } from './traces-test.fixture';
import { TracesService } from './traces.service';

// Opt-in only, against an operator-provided disposable database. All tables live
// in a randomly named test schema; no existing project tables are migrated.
const databaseUrl = process.env.TRACES_TEST_DATABASE_URL;
const postgres = databaseUrl ? describe : describe.skip;
postgres('PostgreSQL traces integration', () => {
  const schema = `traces_test_${randomUUID().replaceAll('-', '')}`;
  const projectId = randomUUID();
  const otherProjectId = randomUUID();
  let bootstrap: DataSource;
  let dataSource: DataSource;
  let service: TracesService;
  beforeAll(async () => {
    bootstrap = await new DataSource({
      type: 'postgres',
      url: databaseUrl,
    }).initialize();
    await bootstrap.query(`CREATE SCHEMA ${schema}`);
    dataSource = await new DataSource({
      type: 'postgres',
      url: databaseUrl,
      schema,
      extra: { options: `-c search_path=${schema},public` },
      entities: [
        MonitoringSpanEntity,
        TraceIngestBatch,
        MonitoringProject,
        Group,
        User,
      ],
      synchronize: false,
      installExtensions: false,
    }).initialize();
    const runner = dataSource.createQueryRunner();
    try {
      await new Baseline1793577600000().up(runner);
      await new ErrorTraceIndex1795737600000().up(runner);
    } finally {
      await runner.release();
    }
    const userId = randomUUID();
    const groupId = randomUUID();
    await dataSource.query(
      `INSERT INTO users(id, email, password_hash, name) VALUES ($1, 'traces@test.local', 'test', 'test')`,
      [userId],
    );
    await dataSource.query(
      `INSERT INTO groups(id, owner_id, name, slug) VALUES ($1, $2, 'test', 'test')`,
      [groupId, userId],
    );
    await dataSource.query(
      `INSERT INTO monitoring_projects(id, group_id, name, slug, platform, public_key)
       VALUES ($1, $3, 'first', 'first', 'vue', 'first'), ($2, $3, 'second', 'second', 'vue', 'second')`,
      [projectId, otherProjectId, groupId],
    );
    const projects = {
      findForIngestion: (id: string) =>
        Promise.resolve({ id, tracingEnabled: true }),
      getAccess: () =>
        Promise.resolve({
          role: 'owner',
          permissions: ['project:web-vitals:read'],
        }),
      findReadableBySlug: () => Promise.resolve({ id: projectId }),
    };
    service = new TracesService(
      dataSource,
      projects as unknown as MonitoringProjectsService,
    );
  });
  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (bootstrap?.isInitialized) {
      await bootstrap.query(`DROP SCHEMA ${schema} CASCADE`);
      await bootstrap.destroy();
    }
  });
  it('handles concurrent retries, conflicting rollback, SQL metrics, pagination and isolation', async () => {
    const envelope = transactionFixture();
    envelope.transaction.spans[0].op = 'http.client';
    Object.assign(envelope.transaction.spans[0], {
      httpStatusCode: 200,
      durationMs: 10,
      ttfbMs: 0,
    });
    const second = {
      ...envelope.transaction.spans[0],
      spanId: '3'.repeat(16),
      durationMs: 100,
      status: 'error',
      httpStatusCode: 503,
    };
    envelope.transaction.spans.push(second);
    await Promise.all([
      service.ingest(projectId, 'key', envelope as never),
      service.ingest(projectId, 'key', envelope as never),
    ]);
    const conflicting = structuredClone(envelope);
    conflicting.transaction.eventId = randomUUID();
    conflicting.transaction.spans.unshift({
      ...second,
      spanId: '4'.repeat(16),
    });
    conflicting.transaction.spans[1].name = 'conflicting';
    await expect(
      service.ingest(projectId, 'key', conflicting as never),
    ).rejects.toThrow('Span ID');
    const count = await dataSource.query<{ count: string }[]>(
      'SELECT count(*)::text AS count FROM monitoring_spans',
    );
    expect(count[0].count).toBe('2');
    await service.ingest(otherProjectId, 'key', envelope as never);
    const start = new Date(Date.now() - 60000).toISOString();
    const end = new Date(Date.now() + 60000).toISOString();
    const query = new SpanQueryPipe().transform({
      start,
      end,
      filters: [],
      metrics: [
        { function: 'count', field: 'spans' },
        { function: 'p95', field: 'span.duration' },
        { function: 'errorRate', field: 'spans' },
      ],
      groupBy: ['span.op'],
    });
    const aggregate = await service.aggregates(
      'user',
      'group',
      'project',
      query,
    );
    expect(aggregate.sampleCount).toBe(2);
    expect(aggregate.items[0].values).toEqual([2, 95.5, 0.5]);
    const timeseries = await service.timeseries(
      'user',
      'group',
      'project',
      query,
    );
    expect(timeseries.series).toHaveLength(3);
    expect(
      timeseries.series[0].points.reduce(
        (sum, point) => sum + (point.value ?? 0),
        0,
      ),
    ).toBe(2);
    const samples = await service.samples('user', 'group', 'project', {
      ...query,
      pageSize: 1,
    });
    expect(samples.total).toBe(2);
    expect(samples.items).toHaveLength(1);
    const traces = await service.traceSamples(
      'user',
      'group',
      'project',
      query,
    );
    expect(traces.items).toHaveLength(1);
    expect(traces.items[0]).toMatchObject({
      traceId: envelope.transaction.spans[0].traceId,
      rootSpanId: envelope.transaction.spans[0].spanId,
      rootName: envelope.transaction.spans[0].name,
      rootOp: 'http.client',
      spanCount: 2,
    });
    const detail = await service.detail(
      'user',
      'group',
      'project',
      envelope.transaction.spans[0].traceId,
    );
    expect(detail.items).toHaveLength(2);
    expect(detail.hasMore).toBe(false);
  });
  it('isolates navigation descendants within a shared SPA trace and resolves child anchors', async () => {
    const input = transactionFixture();
    input.transaction.eventId = randomUUID();
    const first = {
      ...input.transaction.spans[0],
      traceId: 'a'.repeat(32),
      spanId: 'a'.repeat(16),
      name: '/home',
      startTime: '2026-11-25T00:00:00.000Z',
      endTime: '2026-11-25T00:00:01.000Z',
      durationMs: 1000,
    };
    const next = {
      ...first,
      spanId: 'b'.repeat(16),
      parentSpanId: first.spanId,
      op: 'navigation',
      name: '/orders',
      startTime: '2026-11-25T00:10:00.000Z',
      endTime: '2026-11-25T00:10:01.000Z',
    };
    const oldResource = {
      ...first,
      spanId: 'c'.repeat(16),
      parentSpanId: first.spanId,
      isTransaction: false,
      op: 'resource.script',
      name: 'home.js',
    };
    const newResource = {
      ...next,
      spanId: 'd'.repeat(16),
      parentSpanId: next.spanId,
      isTransaction: false,
      op: 'resource.script',
      name: 'orders.js',
    };
    input.transaction.spans = [first, next, oldResource, newResource];
    await service.ingest(projectId, 'key', input as never);
    const initial = await service.detail(
      'user',
      'group',
      'project',
      first.traceId,
    );
    expect(initial.items.map((span) => span.spanId).sort()).toEqual(
      [first.spanId, oldResource.spanId].sort(),
    );
    expect(initial.navigationSpanId).toBe(first.spanId);
    const linked = await service.detail(
      'user',
      'group',
      'project',
      first.traceId,
      undefined,
      newResource.spanId,
    );
    expect(linked.items.map((span) => span.spanId).sort()).toEqual(
      [next.spanId, newResource.spanId].sort(),
    );
    expect(linked.navigationSpanId).toBe(next.spanId);
    expect(linked.navigations).toHaveLength(2);
    await expect(
      service.detail(
        'user',
        'group',
        'project',
        first.traceId,
        Buffer.from(
          JSON.stringify({
            time: first.startTime,
            spanId: first.spanId,
            traceId: first.traceId,
            scopeSpanId: first.spanId,
          }),
        ).toString('base64url'),
        newResource.spanId,
      ),
    ).rejects.toThrow('another page');
  });

  it('correlates retained errors by project, trace and span with exact totals and bounded summaries', async () => {
    const traceId = 'e'.repeat(32);
    const spanId = 'e'.repeat(16);
    const input = transactionFixture();
    input.transaction.eventId = randomUUID();
    input.transaction.spans = [
      { ...input.transaction.spans[0], traceId, spanId, status: 'ok' },
    ];
    await service.ingest(projectId, 'key', input as never);
    const issueId = randomUUID();
    const otherIssueId = randomUUID();
    await dataSource.query(
      `INSERT INTO monitoring_error_issues
      (id, project_id, fingerprint, title, exception_type, first_seen_at, last_seen_at)
      VALUES ($1, $2, $5, 'Error', 'TypeError', now(), now()), ($3, $4, $5, 'Other', 'Error', now(), now())`,
      [issueId, projectId, otherIssueId, otherProjectId, 'e'.repeat(64)],
    );
    const insertError = (
      project: string,
      issue: string,
      trace: string,
      span: string,
      n: number,
    ) =>
      dataSource.query(
        `INSERT INTO monitoring_events
        (id, project_id, issue_id, timestamp, received_at, source, level, message, exception_type, exception_value, contexts)
        VALUES ($1, $2, $3, $4, now(), 'manual', 'error', $5, 'TypeError', $5, $6)`,
        [
          randomUUID(),
          project,
          issue,
          new Date(Date.UTC(2026, 10, 27, 0, 0, n)),
          `failure-${n}`,
          { trace: { traceId: trace, spanId: span, sampled: true } },
        ],
      );
    for (let n = 0; n < 7; n++)
      await insertError(projectId, issueId, traceId, spanId, n);
    await insertError(otherProjectId, otherIssueId, traceId, spanId, 8);
    await insertError(projectId, issueId, 'f'.repeat(32), spanId, 9);
    await insertError(projectId, issueId, traceId, 'f'.repeat(16), 10);
    const result = await service.detail('user', 'group', 'project', traceId);
    expect(result.items[0]).toMatchObject({ status: 'ok', errorCount: 7 });
    expect(result.items[0].errors).toHaveLength(5);
    expect(result.items[0].errors?.map((error) => error.message)).toEqual([
      'failure-6',
      'failure-5',
      'failure-4',
      'failure-3',
      'failure-2',
    ]);
    expect(
      result.items[0].errors?.every((error) => error.issueId === issueId),
    ).toBe(true);
  });
});

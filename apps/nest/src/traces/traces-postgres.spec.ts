import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Traces1790850000000 } from '../database/migrations/1790850000000-traces';
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
      extra: { options: `-c search_path=${schema}` },
      entities: [
        MonitoringSpanEntity,
        TraceIngestBatch,
        MonitoringProject,
        Group,
        User,
      ],
      synchronize: false,
    }).initialize();
    await dataSource.query(
      'CREATE TABLE monitoring_projects (id uuid PRIMARY KEY)',
    );
    await dataSource.query(
      'INSERT INTO monitoring_projects(id) VALUES ($1), ($2)',
      [projectId, otherProjectId],
    );
    const runner = dataSource.createQueryRunner();
    try {
      await new Traces1790850000000().up(runner);
    } finally {
      await runner.release();
    }
    const projects = {
      findForIngestion: (id: string) =>
        Promise.resolve({ id, tracingEnabled: true }),
      findOwnedBySlug: () => Promise.resolve({ id: projectId }),
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
    const detail = await service.detail(
      'user',
      'group',
      'project',
      envelope.transaction.spans[0].traceId,
    );
    expect(detail.items).toHaveLength(2);
    expect(detail.hasMore).toBe(false);
  });
});

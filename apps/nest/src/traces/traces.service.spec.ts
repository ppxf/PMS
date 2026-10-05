import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
import { MonitoringSpanEntity } from './entities/monitoring-span.entity';
import { SpanQueryPipe } from './traces-validation';
import { transactionFixture } from './traces-test.fixture';
import { contentHash, TracesService } from './traces.service';
import { TracesRetentionService } from './traces-retention.service';

describe('traces atomic ingestion', () => {
  const projectId = '550e8400-e29b-41d4-a716-446655440000';
  function fixture(enabled = true) {
    const storedSpans = new Map<string, Record<string, unknown>>();
    const storedBatches = new Map<string, Record<string, unknown>>();
    const query = jest.fn(() => Promise.resolve([]));
    const repository = (
      map: Map<string, Record<string, unknown>>,
      key: string,
    ) => ({
      findOneBy: jest.fn((where: Record<string, string>) =>
        Promise.resolve(map.get(where[key]) ?? null),
      ),
      insert: jest.fn((row: Record<string, unknown>) => {
        map.set(row[key] as string, row);
        return Promise.resolve({});
      }),
    });
    const spans = repository(storedSpans, 'spanId');
    const batches = repository(storedBatches, 'eventId');
    const manager = {
      query,
      getRepository: (entity: unknown) =>
        entity === MonitoringSpanEntity ? spans : batches,
    };
    const dataSource = {
      transaction: jest.fn(
        async (action: (manager: unknown) => Promise<void>) => {
          const beforeSpans = new Map(storedSpans);
          const beforeBatches = new Map(storedBatches);
          try {
            await action(manager);
          } catch (error) {
            storedSpans.clear();
            beforeSpans.forEach((value, key) => storedSpans.set(key, value));
            storedBatches.clear();
            beforeBatches.forEach((value, key) =>
              storedBatches.set(key, value),
            );
            throw error;
          }
        },
      ),
    };
    const projects = {
      findForIngestion: jest.fn(() =>
        Promise.resolve({ id: projectId, tracingEnabled: enabled }),
      ),
    };
    return {
      service: new TracesService(
        dataSource as unknown as DataSource,
        projects as unknown as MonitoringProjectsService,
      ),
      storedSpans,
      storedBatches,
      query,
      spans,
      batches,
    };
  }
  it('stores a batch and treats identical retries as no-ops with transaction lock', async () => {
    const f = fixture();
    const input = transactionFixture();
    await f.service.ingest(projectId, 'key', input as never);
    await f.service.ingest(projectId, 'key', input as never);
    expect(f.spans.insert).toHaveBeenCalledTimes(1);
    expect(f.batches.insert).toHaveBeenCalledTimes(1);
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      [projectId],
    );
    const changed = structuredClone(input);
    changed.transaction.spans[0].name = 'changed';
    await expect(
      f.service.ingest(projectId, 'key', changed as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(f.storedSpans.size).toBe(1);
    expect(f.storedBatches.size).toBe(1);
  });
  it('deduplicates matching spans across batches and rolls back the whole conflicting batch', async () => {
    const f = fixture();
    const input = transactionFixture();
    await f.service.ingest(projectId, 'key', input as never);
    const second = structuredClone(input);
    second.transaction.eventId = '550e8400-e29b-41d4-a716-446655440001';
    await f.service.ingest(projectId, 'key', second as never);
    expect(f.spans.insert).toHaveBeenCalledTimes(1);
    second.transaction.eventId = '550e8400-e29b-41d4-a716-446655440002';
    second.transaction.spans.unshift({
      ...second.transaction.spans[0],
      spanId: '3'.repeat(16),
    });
    second.transaction.spans[1].name = 'conflict';
    await expect(
      f.service.ingest(projectId, 'key', second as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(f.storedSpans.size).toBe(1);
    expect(f.storedBatches.size).toBe(2);
  });
  it('authorizes and respects tracingEnabled before transaction writes', async () => {
    const f = fixture(false);
    await expect(
      f.service.ingest(projectId, 'key', transactionFixture() as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.query).not.toHaveBeenCalled();
  });
  it('hashes object keys canonically', () => {
    expect(contentHash({ b: 2, a: { d: 4, c: 3 } })).toBe(
      contentHash({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });
});

describe('bounded authorized SQL queries', () => {
  function fixture() {
    const query = jest.fn<
      Promise<Record<string, unknown>[]>,
      [string, unknown[]?]
    >();
    const manager = { query } as unknown as EntityManager;
    const dataSource = {
      transaction: (
        _isolation: unknown,
        action: (manager: EntityManager) => Promise<unknown>,
      ) => action(manager),
    } as unknown as DataSource;
    const projects = {
      findOwnedBySlug: jest.fn(() => Promise.resolve({ id: 'project-id' })),
    } as unknown as MonitoringProjectsService;
    const service = new TracesService(dataSource, projects);
    const input = new SpanQueryPipe().transform({
      start: '2026-10-01T00:00:00Z',
      end: '2026-10-01T00:03:00Z',
      filters: [],
      metrics: [
        { function: 'count', field: 'spans' },
        { function: 'p95', field: 'span.duration' },
      ],
      groupBy: ['span.op'],
    });
    return { service, query, input, projects };
  }
  it.each([
    ['3h', 10800000],
    ['6h', 21600000],
    ['1d', 86400000],
  ])(
    'aggregates %s buckets using the selected SQL interval',
    async (interval, intervalMs) => {
      const f = fixture();
      const input = new SpanQueryPipe().transform({
        ...f.input,
        end: '2026-10-03T00:00:00Z',
        interval,
      });
      f.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: '1' }])
        .mockResolvedValueOnce([
          {
            groupKey: '["http.client"]',
            groupValues: ['http.client'],
            m0: '1',
            n0: '1',
            m1: 5,
            n1: '1',
          },
        ])
        .mockResolvedValueOnce([
          {
            bucket: 0,
            groupKey: '["http.client"]',
            m0: '1',
            n0: '1',
            m1: 5,
            n1: '1',
          },
        ]);
      const result = await f.service.timeseries(
        'owner',
        'group',
        'project',
        input,
      );
      expect(result.intervalMs).toBe(intervalMs);
      const points = result.series[0].points;
      expect(points).toHaveLength((2 * 86400000) / Number(intervalMs));
      expect(
        Date.parse(points[1].timestamp) - Date.parse(points[0].timestamp),
      ).toBe(intervalMs);
      expect(points[0].value).toBe(1);
      expect(points[1].value).toBe(0);
      expect(result.series[1].points[1].value).toBeNull();
      expect(f.query.mock.calls[3][1]).toContain(Number(intervalMs) / 1000);
    },
  );
  it('fills empty buckets without changing the whole-range Top N and sample counts', async () => {
    const f = fixture();
    f.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: '2' }])
      .mockResolvedValueOnce([
        {
          groupKey: '["http.client"]',
          groupValues: ['http.client'],
          m0: '2',
          n0: '2',
          m1: 5,
          n1: '1',
        },
      ])
      .mockResolvedValueOnce([
        {
          bucket: 0,
          groupKey: '["http.client"]',
          m0: '2',
          n0: '2',
          m1: 5,
          n1: '1',
        },
      ]);
    const result = await f.service.timeseries(
      'owner',
      'group',
      'project',
      f.input,
    );
    expect(jest.spyOn(f.projects, 'findOwnedBySlug')).toHaveBeenCalledWith(
      'owner',
      'group',
      'project',
    );
    expect(result.series[0].points.map((point) => point.value)).toEqual([
      2, 0, 0,
    ]);
    expect(result.series[1].points.map((point) => point.value)).toEqual([
      5,
      null,
      null,
    ]);
    expect(result.series[1].points[0].sampleCount).toBe(1);
    const rankSql = f.query.mock.calls[2][0];
    expect(rankSql).toContain('percentile_cont(0.95)');
    expect(rankSql).toContain('truncated = false');
    expect(rankSql).toContain('ORDER BY m0 DESC');
    expect(rankSql).not.toContain('bucket');
  });
  it('binds filter values and refuses an oversized scan', async () => {
    const f = fixture();
    f.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: '100001' }]);
    f.input.filters = [
      {
        field: 'span.name',
        operator: 'eq',
        value: "'; DROP TABLE monitoring_spans",
      },
    ];
    await expect(
      f.service.samples('owner', 'group', 'project', f.input),
    ).rejects.toThrow('narrow');
    expect(f.query.mock.calls[1][0]).not.toContain('DROP TABLE');
    expect(f.query.mock.calls[1][1]).toContain(
      "'; DROP TABLE monitoring_spans",
    );
  });
  it('denies read before accessing database', async () => {
    const f = fixture();
    jest
      .spyOn(f.projects, 'findOwnedBySlug')
      .mockRejectedValue(new ForbiddenException());
    await expect(
      f.service.samples('other', 'group', 'project', f.input),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.query).not.toHaveBeenCalled();
  });
});

describe('retention', () => {
  it('defaults to dry-run and uses received_at seven-day cutoff for both tables', async () => {
    const query = jest.fn<Promise<{ count: string }[]>, [string]>(() =>
      Promise.resolve([{ count: '2' }]),
    );
    const dataSource = {
      transaction: (action: (manager: unknown) => Promise<unknown>) =>
        action({ query }),
    } as unknown as DataSource;
    const result = await new TracesRetentionService(dataSource).cleanup(
      false,
      new Date('2026-10-08T00:00:00Z'),
    );
    expect(result).toEqual({
      cutoff: '2026-10-01T00:00:00.000Z',
      spans: 2,
      batches: 2,
      executed: false,
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.every(([sql]) => !sql.includes('DELETE'))).toBe(
      true,
    );
  });
});

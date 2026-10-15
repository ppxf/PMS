import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
import { MetricBatchEntity } from './metric.entity';
import { MetricQueryPipe, MetricsEnvelopePipe } from './metrics-validation';
import { MetricsService } from './metrics.service';
const envelope = () => ({
  version: 1,
  type: 'metrics',
  sentAt: new Date().toISOString(),
  eventId: '550e8400-e29b-41d4-a716-446655440000',
  samples: [
    {
      name: 'orders',
      type: 'count',
      unit: 'none',
      value: 3,
      timestamp: new Date().toISOString(),
      attributes: { route: '/checkout' },
    },
  ],
});
const queryInput = () => ({
  name: 'orders',
  type: 'count',
  unit: 'none',
  aggregation: 'sum',
  start: new Date(Date.now() - 3600000).toISOString(),
  end: new Date().toISOString(),
});
describe('metrics contract', () => {
  it('validates Metrics-native operator conditions instead of legacy attribute-only filters', () => {
    const filters = [
      {
        field: 'environment',
        operator: 'in',
        value: ['production', 'staging'],
      },
      { field: 'value', operator: 'gte', value: 200 },
      { field: 'browser.name', operator: 'contains', value: 'Chrome' },
      { field: 'attributes.in_stock', operator: 'eq', value: false },
      { field: 'release', operator: 'exists', value: false },
    ];
    expect(
      new MetricQueryPipe().transform({ ...queryInput(), filters }).filters,
    ).toEqual(filters);
    for (const filter of [
      { field: 'span.op', operator: 'eq', value: 'pageload' },
      { field: 'value', operator: 'contains', value: '20' },
      { field: 'value', operator: 'gt', value: '20' },
      { field: 'browser.name', operator: 'gt', value: 2 },
      { field: 'attributes.constructor', operator: 'eq', value: 1 },
      { field: 'environment', operator: 'in', value: [] },
      { field: 'release', operator: 'exists', value: 'true' },
    ])
      expect(() =>
        new MetricQueryPipe().transform({ ...queryInput(), filters: [filter] }),
      ).toThrow(BadRequestException);
  });
  it('enforces aggregation semantics for each metric type', () => {
    for (const [type, aggregation] of [
      ['count', 'sum'],
      ['gauge', 'last'],
      ['distribution', 'p95'],
    ]) {
      expect(
        new MetricQueryPipe().transform({ ...queryInput(), type, aggregation }),
      ).toMatchObject({ type, aggregation });
    }
    for (const [type, aggregation] of [
      ['count', 'p95'],
      ['gauge', 'sum'],
      ['distribution', 'last'],
    ]) {
      expect(() =>
        new MetricQueryPipe().transform({ ...queryInput(), type, aggregation }),
      ).toThrow(BadRequestException);
    }
  });
  it('accepts multiple typed group dimensions and rejects duplicates and excessive dimensions', () => {
    expect(
      new MetricQueryPipe().transform({
        ...queryInput(),
        groupBy: ['browser.name', 'value', 'attributes.region'],
      }).groupBy,
    ).toEqual(['browser.name', 'value', 'attributes.region']);
    for (const groupBy of [
      ['value', 'value'],
      ['a', 'b', 'c', 'd', 'e', 'f'],
      ['attributes.constructor'],
    ]) {
      expect(() =>
        new MetricQueryPipe().transform({ ...queryInput(), groupBy }),
      ).toThrow(BadRequestException);
    }
  });
  it('accepts trace and span filters and rejects malformed or span-only filters', () => {
    const traceId = '1'.repeat(32),
      spanId = '2'.repeat(16);
    expect(
      new MetricQueryPipe().transform({ ...queryInput(), traceId, spanId }),
    ).toMatchObject({ traceId, spanId });
    for (const change of [
      { traceId: 'bad' },
      { traceId: '0'.repeat(32) },
      { spanId },
      { traceId, spanId: 'bad' },
    ]) {
      expect(() =>
        new MetricQueryPipe().transform({ ...queryInput(), ...change }),
      ).toThrow(BadRequestException);
    }
  });
  it('accepts metrics and rejects whole malformed batches', () => {
    expect(
      new MetricsEnvelopePipe().transform(envelope()).samples[0].value,
    ).toBe(3);
    for (const change of [
      { value: -1 },
      { value: Infinity },
      { traceId: 'bad' },
      { attributes: { route: {} } },
      { unexpected: true },
    ]) {
      const input = envelope();
      Object.assign(input.samples[0], change);
      expect(() => new MetricsEnvelopePipe().transform(input)).toThrow(
        BadRequestException,
      );
    }
  });
  it('bounds query ranges and buckets and validates scalar filters', () => {
    expect(new MetricQueryPipe().transform(queryInput())).toMatchObject({
      page: 1,
      pageSize: 20,
      filters: [],
    });
    for (const change of [
      { aggregation: 'sql' },
      { intervalSeconds: 0 },
      { filters: [{ key: 'route', value: {} }] },
      { groupBy: 'constructor' },
      { page: 0 },
      { start: new Date(Date.now() - 8 * 86400000).toISOString() },
    ]) {
      expect(() =>
        new MetricQueryPipe().transform({ ...queryInput(), ...change }),
      ).toThrow(BadRequestException);
    }
  });
});
describe('metrics ingestion and authorization', () => {
  function fixture() {
    let batch: { contentHash: string } | null = null;
    const batches = {
      findOneBy: jest.fn(() => Promise.resolve(batch)),
      insert: jest.fn((value: { contentHash: string }) => {
        batch = value;
        return Promise.resolve();
      }),
    };
    const samples = { insert: jest.fn(() => Promise.resolve()) };
    const manager = {
      query: jest.fn(() => Promise.resolve([])),
      getRepository: (entity: unknown) =>
        entity === MetricBatchEntity ? batches : samples,
    };
    const source = {
      transaction: jest.fn((action: (m: unknown) => unknown) =>
        Promise.resolve(action(manager)),
      ),
    };
    const projects = {
      findForIngestion: jest.fn(() =>
        Promise.resolve({ metricsEnabled: true }),
      ),
      findOwnedBySlug: jest.fn(() => Promise.resolve({ id: 'project' })),
    };
    return {
      service: new MetricsService(
        source as unknown as DataSource,
        projects as unknown as MonitoringProjectsService,
      ),
      projects,
      manager,
      batches,
      samples,
    };
  }
  it('deduplicates identical retries and rejects conflicting content', async () => {
    const f = fixture(),
      input = envelope();
    await f.service.ingest('project', 'key', input as never);
    await f.service.ingest('project', 'key', input as never);
    expect(f.samples.insert).toHaveBeenCalledTimes(1);
    input.samples[0].value++;
    await expect(
      f.service.ingest('project', 'key', input as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('uses the received client address and keeps retries idempotent across address changes', async () => {
    const f = fixture(),
      input = envelope();
    input.samples[0].attributes = { 'client.address': 'spoofed' } as never;
    await f.service.ingest('project', 'key', input as never, '192.0.2.10');
    await f.service.ingest('project', 'key', input as never, '192.0.2.20');
    const inserted = f.samples.insert.mock.calls[0] as unknown as [
      { attributes: Record<string, string> }[],
    ];
    expect(inserted[0][0].attributes['client.address']).toBe('192.0.2.10');
    expect(f.samples.insert).toHaveBeenCalledTimes(1);
  });
  it('discovers actual metric identities and typed custom group attributes', async () => {
    const f = fixture();
    f.manager.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          name: 'inventory.stock',
          type: 'gauge',
          unit: 'none',
          sampleCount: 2,
          lastSeen: '2026-10-14T00:00:00Z',
        },
      ] as never)
      .mockResolvedValueOnce([
        { key: 'warehouse', types: ['string'] },
        { key: 'in_stock', types: ['boolean'] },
        { key: 'browser.name', types: ['string'] },
        { key: 'value', types: ['string'] },
        { key: 'project', types: ['string'] },
      ] as never);
    const catalog = await f.service.catalog('user', 'team', 'web');
    expect(catalog.items.map((item) => item.name)).toEqual(['inventory.stock']);
    expect(catalog.groupFields).toEqual(
      expect.arrayContaining([
        { key: 'value', label: 'value', type: 'number' },
        { key: 'browser.name', label: 'browser.name', type: 'string' },
        { key: 'attributes.warehouse', label: 'warehouse', type: 'string' },
        { key: 'attributes.in_stock', label: 'in_stock', type: 'boolean' },
        { key: 'attributes.value', label: 'attributes.value', type: 'string' },
        {
          key: 'attributes.project',
          label: 'attributes.project',
          type: 'string',
        },
      ]),
    );
    expect(
      catalog.groupFields.filter((field) => field.key === 'browser.name'),
    ).toHaveLength(1);
  });
  it('combines built-in and custom groups without leaking group parameters into sample filters', async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const groupValue = ['Chrome', 150, 'web', false];
    const start = new Date(Date.now() - 120000).toISOString(),
      end = new Date().toISOString();
    const manager = {
      query: (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.startsWith('SET')) return Promise.resolve([]);
        if (sql.includes('bounded')) return Promise.resolve([{ total: 1 }]);
        if (sql.includes('AS bucket'))
          return Promise.resolve([
            { bucket: 0, groupValue, value: 200, sampleCount: 1 },
          ]);
        if (sql.includes('GROUP BY 1 ORDER'))
          return Promise.resolve([{ groupValue, value: 200, sampleCount: 1 }]);
        return Promise.resolve([]);
      },
    };
    const source = {
      transaction: (_isolation: string, action: (m: unknown) => unknown) =>
        action(manager),
    };
    const projects = {
      findOwnedBySlug: () => Promise.resolve({ id: 'owned', slug: 'web' }),
    };
    const service = new MetricsService(
      source as unknown as DataSource,
      projects as unknown as MonitoringProjectsService,
    );
    const response = await service.query('user', 'team', 'web', {
      ...queryInput(),
      start,
      end,
      type: 'distribution',
      aggregation: 'p95',
      unit: 'millisecond',
      groupBy: ['browser.name', 'value', 'project', 'attributes.in_stock'],
      intervalSeconds: 60,
    } as never);
    expect(response.series[0]).toMatchObject({
      groupValue,
      points: [
        { value: 200, sampleCount: 1 },
        { value: null, sampleCount: 0 },
      ],
    });
    const grouping = calls.find((call) =>
      call.sql.includes('GROUP BY 1 ORDER'),
    )!;
    expect(grouping.sql).toContain(
      'jsonb_build_array(attributes -> $7::text, to_jsonb(value), to_jsonb($8::text), attributes -> $9::text)',
    );
    expect(grouping.sql).toContain('percentile_cont(0.95)');
    expect(grouping.params.slice(6)).toEqual([
      'browser.name',
      'web',
      'in_stock',
    ]);
    expect(
      calls.find((call) => call.sql.startsWith('SELECT event_id'))?.params,
    ).toEqual(['owned', start, end, 'orders', 'distribution', 'millisecond']);
  });
  it('checks enabled state before writing and owner before reading', async () => {
    const f = fixture();
    f.projects.findForIngestion.mockResolvedValue({ metricsEnabled: false });
    await expect(
      f.service.ingest('project', 'key', envelope() as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.samples.insert).not.toHaveBeenCalled();
    f.projects.findOwnedBySlug.mockRejectedValue(new ForbiddenException());
    await expect(
      f.service.catalog('other', 'team', 'web'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.manager.query).not.toHaveBeenCalled();
  });
  it('parameterizes attributes, preserves missing buckets and selects latest gauge observations', async () => {
    const calls: { sql: string; values: unknown[] }[] = [];
    const start = new Date(Date.now() - 120000).toISOString(),
      end = new Date().toISOString();
    const manager = {
      query: jest.fn((sql: string, values: unknown[] = []) => {
        calls.push({ sql, values });
        if (sql.startsWith('SET')) return Promise.resolve([]);
        if (sql.includes('bounded')) return Promise.resolve([{ total: 1 }]);
        if (sql.includes('AS bucket'))
          return Promise.resolve([
            { bucket: 0, groupValue: 'east', value: 7, sampleCount: 1 },
          ]);
        if (sql.includes('GROUP BY 1 ORDER'))
          return Promise.resolve([
            { groupValue: 'east', value: 7, sampleCount: 1 },
          ]);
        return Promise.resolve([]);
      }),
    };
    const source = {
      transaction: (_isolation: string, action: (m: unknown) => unknown) =>
        Promise.resolve(action(manager)),
    };
    const projects = {
      findOwnedBySlug: jest.fn(() => Promise.resolve({ id: 'owned' })),
    };
    const service = new MetricsService(
      source as unknown as DataSource,
      projects as unknown as MonitoringProjectsService,
    );
    const response = await service.query('user', 'team', 'web', {
      ...queryInput(),
      start,
      end,
      type: 'gauge',
      aggregation: 'last',
      intervalSeconds: 60,
      groupBy: 'region',
      traceId: '1'.repeat(32),
      spanId: '2'.repeat(16),
      filters: [
        {
          field: "attributes.route' OR true --",
          operator: 'eq',
          value: '/checkout',
        },
      ],
    } as never);
    expect(response.series[0].points[0].value).toBe(7);
    expect(response.series[0].points[1]).toMatchObject({
      value: null,
      sampleCount: 0,
    });
    expect(calls.some((call) => call.sql.includes("route' OR true --"))).toBe(
      false,
    );
    expect(calls.find((call) => call.sql.includes('bounded'))?.values).toEqual([
      'owned',
      start,
      end,
      'orders',
      'gauge',
      'none',
      '1'.repeat(32),
      '2'.repeat(16),
      "route' OR true --",
      '"/checkout"',
    ]);
    expect(
      calls.find((call) => call.sql.includes('GROUP BY 1 ORDER'))?.sql,
    ).toContain('array_agg(value ORDER BY timestamp DESC');
    expect(calls.find((call) => call.sql.includes('bounded'))?.sql).toContain(
      'trace_id = $7 AND span_id = $8',
    );
  });
  it('uses the same bound operator conditions for counts, aggregates, charts and samples', async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const manager = {
      query: (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.startsWith('SET')) return Promise.resolve([]);
        if (sql.includes('bounded')) return Promise.resolve([{ total: 1 }]);
        if (sql.includes('AS bucket'))
          return Promise.resolve([
            { bucket: 0, groupValue: 'all', value: 3, sampleCount: 1 },
          ]);
        if (sql.includes('GROUP BY 1 ORDER'))
          return Promise.resolve([
            { groupValue: 'all', value: 3, sampleCount: 1 },
          ]);
        return Promise.resolve([]);
      },
    };
    const source = {
      transaction: (_isolation: string, action: (m: unknown) => unknown) =>
        action(manager),
    };
    const projects = {
      findOwnedBySlug: () => Promise.resolve({ id: 'owned' }),
    };
    const service = new MetricsService(
      source as unknown as DataSource,
      projects as unknown as MonitoringProjectsService,
    );
    const filters = [
      { field: 'environment', operator: 'not_in', value: ['dev', 'test'] },
      { field: 'value', operator: 'gte', value: 2 },
      { field: 'browser.name', operator: 'contains', value: "Chrome_%'" },
      { field: 'attributes.in_stock', operator: 'eq', value: false },
      { field: 'attributes.queue_depth', operator: 'gt', value: 5 },
      { field: 'release', operator: 'exists', value: false },
    ];
    await service.query('user', 'team', 'web', {
      ...queryInput(),
      filters,
    } as never);
    const reads = calls.filter((call) => call.sql.startsWith('SELECT'));
    expect(reads).toHaveLength(4);
    for (const call of reads) {
      expect(call.sql).toContain(
        'to_jsonb(environment) IS NULL OR to_jsonb(environment) NOT IN ($7::jsonb, $8::jsonb)',
      );
      expect(call.sql).toContain('to_jsonb(release) IS NULL');
      expect(call.sql).toContain(
        "CASE WHEN jsonb_typeof(to_jsonb(value)) = 'number'",
      );
      expect(call.sql).toContain('::double precision END) >');
      expect(call.sql).toContain('strpos(');
      expect(call.sql).not.toContain("Chrome_%'");
      expect(call.params.slice(6, 15)).toEqual([
        '"dev"',
        '"test"',
        2,
        'browser.name',
        "Chrome_%'",
        'in_stock',
        'false',
        'queue_depth',
        5,
      ]);
    }
  });
});

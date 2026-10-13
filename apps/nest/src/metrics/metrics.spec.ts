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
      filters: [{ key: "route' OR true --", value: '/checkout' }],
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
      "route' OR true --",
      '"/checkout"',
    ]);
    expect(
      calls.find((call) => call.sql.includes('GROUP BY 1 ORDER'))?.sql,
    ).toContain('array_agg(value ORDER BY timestamp DESC');
  });
});

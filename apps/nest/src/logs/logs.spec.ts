import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
import { LogBatchEntity } from './log.entity';
import { LogQueryPipe, LogsEnvelopePipe } from './logs-validation';
import { LogsService } from './logs.service';
const envelope = () => ({
  version: 1,
  type: 'logs',
  sentAt: new Date().toISOString(),
  eventId: '550e8400-e29b-41d4-a716-446655440000',
  logs: [
    {
      logId: '550e8400-e29b-41d4-a716-446655440001',
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'Order created',
      attributes: { count: 2 },
    },
  ],
});
const queryInput = () => ({
  start: new Date(Date.now() - 120000).toISOString(),
  end: new Date().toISOString(),
});
describe('logs validation', () => {
  it('accepts structured logs and rejects the whole malformed batch', () => {
    expect(new LogsEnvelopePipe().transform(envelope()).logs[0].level).toBe(
      'info',
    );
    for (const change of [
      { level: 'sql' },
      { message: '' },
      { traceId: 'bad' },
      { attributes: { nested: {} } },
      { unexpected: true },
      { logId: '-'.repeat(36) },
      { timestamp: '2020-01-01T00:00:00.000Z' },
    ]) {
      const input = envelope();
      Object.assign(input.logs[0], change);
      expect(() => new LogsEnvelopePipe().transform(input)).toThrow(
        BadRequestException,
      );
    }
    const input = envelope();
    input.logs.push(input.logs[0]);
    expect(() => new LogsEnvelopePipe().transform(input)).toThrow(
      BadRequestException,
    );
  });
  it('bounds filters, time windows, sorting and pagination', () => {
    expect(new LogQueryPipe().transform(queryInput())).toMatchObject({
      page: 1,
      pageSize: 20,
      levels: [],
      sortDirection: 'desc',
    });
    for (const change of [
      { levels: ['info', 'info'] },
      { levels: ['sql'] },
      { sortDirection: 'desc;drop table' },
      { page: 0 },
      { filters: [{ key: 'route', value: {} }] },
      { intervalSeconds: 0 },
      { start: new Date(Date.now() - 8 * 86400000).toISOString() },
    ]) {
      expect(() =>
        new LogQueryPipe().transform({ ...queryInput(), ...change }),
      ).toThrow(BadRequestException);
    }
  });
});
describe('logs storage', () => {
  function fixture() {
    const receipts = new Map<string, any>(),
      records = new Map<string, any>();
    const repository = (map: Map<string, any>, key: string) => ({
      findOneBy: jest.fn((value: any) =>
        Promise.resolve(map.get(value[key]) ?? null),
      ),
      insert: jest.fn((value: any) => {
        map.set(value[key], value);
        return Promise.resolve();
      }),
    });
    const batches = repository(receipts, 'eventId'),
      logs = repository(records, 'logId');
    const manager = {
      query: jest.fn().mockResolvedValue([]),
      getRepository: (entity: unknown) =>
        entity === LogBatchEntity ? batches : logs,
    };
    const source = {
      transaction: jest.fn(async (...args: any[]) => {
        const beforeRecords = new Map(records),
          beforeReceipts = new Map(receipts);
        try {
          return await args.at(-1)(manager);
        } catch (error) {
          records.clear();
          receipts.clear();
          beforeRecords.forEach((v, k) => records.set(k, v));
          beforeReceipts.forEach((v, k) => receipts.set(k, v));
          throw error;
        }
      }),
    };
    const projects = {
      findForIngestion: jest.fn().mockResolvedValue({ loggingEnabled: true }),
      findOwnedBySlug: jest
        .fn()
        .mockResolvedValue({ id: 'project', loggingEnabled: true }),
    };
    return {
      service: new LogsService(
        source as unknown as DataSource,
        projects as unknown as MonitoringProjectsService,
      ),
      projects,
      manager,
      logs,
      records,
      receipts,
    };
  }
  it('deduplicates batches and individual logs across batches and rejects conflicts', async () => {
    const f = fixture(),
      input = envelope();
    await f.service.ingest('project', 'key', input as never);
    await f.service.ingest('project', 'key', input as never);
    input.eventId = '550e8400-e29b-41d4-a716-446655440002';
    await f.service.ingest('project', 'key', input as never);
    expect(f.logs.insert).toHaveBeenCalledTimes(1);
    expect(f.receipts.size).toBe(2);
    input.logs[0].message = 'conflicting';
    await expect(
      f.service.ingest('project', 'key', input as never),
    ).rejects.toBeInstanceOf(ConflictException);
    input.eventId = '550e8400-e29b-41d4-a716-446655440003';
    await expect(
      f.service.ingest('project', 'key', input as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(f.receipts.size).toBe(2);
  });
  it('rolls back earlier records if a later log conflicts', async () => {
    const f = fixture(),
      input = envelope();
    await f.service.ingest('project', 'key', input as never);
    input.eventId = '550e8400-e29b-41d4-a716-446655440004';
    input.logs.unshift({
      ...input.logs[0],
      logId: '550e8400-e29b-41d4-a716-446655440005',
    });
    input.logs[1].message = 'conflict';
    await expect(
      f.service.ingest('project', 'key', input as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(f.records.size).toBe(1);
    expect(f.receipts.size).toBe(1);
  });
  it('blocks disabled ingestion and propagates owner authorization failures', async () => {
    const f = fixture();
    f.projects.findForIngestion.mockResolvedValue({ loggingEnabled: false });
    await expect(
      f.service.ingest('project', 'key', envelope() as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.logs.insert).not.toHaveBeenCalled();
    f.projects.findOwnedBySlug.mockRejectedValue(new ForbiddenException());
    await expect(
      f.service.query('user', 'group', 'slug', queryInput() as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('binds literal search and typed attributes, sorts stably and zero-fills buckets', async () => {
    const f = fixture();
    f.manager.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([{ logId: 'record' }])
      .mockResolvedValueOnce([{ bucket: 1, level: 'error', count: 1 }]);
    const result = await f.service.query('user', 'group', 'slug', {
      ...queryInput(),
      levels: ['error'],
      search: "%_quote'",
      filters: [{ key: 'count', value: 2 }],
      intervalSeconds: 60,
      page: 2,
      pageSize: 20,
      sortDirection: 'asc',
    } as never);
    expect(f.projects.findOwnedBySlug).toHaveBeenCalledWith(
      'user',
      'group',
      'slug',
    );
    expect(f.manager.query.mock.calls[2][0]).toContain(
      'ORDER BY timestamp ASC, log_id ASC LIMIT 20 OFFSET 20',
    );
    expect(f.manager.query.mock.calls[2][0]).not.toContain('%_quote');
    expect(f.manager.query.mock.calls[2][1]).toEqual(
      expect.arrayContaining(["%_quote'", 'count', '2']),
    );
    expect(result.series[0].points.map((point) => point.count)).toEqual([0, 1]);
  });
  it('rejects overly broad queries before fetching records', async () => {
    const f = fixture();
    f.manager.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 100001 }]);
    await expect(
      f.service.query('user', 'group', 'slug', queryInput() as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(f.manager.query).toHaveBeenCalledTimes(2);
  });
});

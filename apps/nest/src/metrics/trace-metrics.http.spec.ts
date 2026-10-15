import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

describe('Trace metrics query boundary', () => {
  let app: NestExpressApplication;
  const traceId = '1'.repeat(32),
    spanId = '2'.repeat(16);
  const path = `/groups/team/projects/web/metrics/traces/${traceId}`;
  const owner = jest.fn();
  const query = jest.fn();
  const sample = {
    eventId: 'batch',
    sampleIndex: 0,
    name: 'orders',
    type: 'count',
    unit: 'none',
    value: 1,
    timestamp: '2026-10-14T00:00:00Z',
    attributes: {},
    traceId,
    spanId,
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        MetricsService,
        {
          provide: MonitoringProjectsService,
          useValue: { findOwnedBySlug: owner },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: (
              _isolation: string,
              action: (m: unknown) => unknown,
            ) => action({ query }),
          },
        },
      ],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    app.use(
      (req: { user?: { id: string } }, _res: unknown, next: () => void) => {
        req.user = { id: 'user' };
        next();
      },
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    owner.mockReset().mockResolvedValue({ id: 'owned-project' });
    query
      .mockReset()
      .mockImplementation((sql: string) =>
        Promise.resolve(
          sql.startsWith('SET')
            ? []
            : sql.includes('count(*)')
              ? [{ total: 21 }]
              : [sample],
        ),
      );
  });
  it('returns all metric types scoped to owner, project and trace with stable pagination', async () => {
    const response = await request(app.getHttpServer())
      .get(path)
      .query({ page: 2, pageSize: 20 })
      .expect(200);
    expect(response.body).toEqual({
      total: 21,
      page: 2,
      pageSize: 20,
      samples: [sample],
    });
    expect(owner).toHaveBeenCalledWith('user', 'team', 'web');
    const [sql, params] = query.mock.calls.find(([sql]: [string]) =>
      sql.startsWith('SELECT event_id'),
    )!;
    expect(sql).toContain('project_id = $1 AND trace_id = $2');
    expect(sql).toContain(
      'ORDER BY timestamp DESC, event_id DESC, sample_index DESC',
    );
    expect(params).toEqual(['owned-project', traceId, 20, 20]);
  });
  it('parameterizes name search and optional span scope', async () => {
    await request(app.getHttpServer())
      .get(path)
      .query({ search: "orders'_%", spanId })
      .expect(200);
    const [sql, params] = query.mock.calls.find(([sql]: [string]) =>
      sql.startsWith('SELECT event_id'),
    )!;
    expect(sql).toContain('span_id = $3');
    expect(sql).not.toContain("orders'_%");
    expect(params).toEqual([
      'owned-project',
      traceId,
      spanId,
      "orders'_%",
      20,
      0,
    ]);
  });
  it('rejects invalid IDs, unbounded pages and unexpected inputs before querying', async () => {
    for (const input of [
      { page: 0 },
      { pageSize: 101 },
      { spanId: 'bad' },
      { unexpected: true },
      { search: 'x'.repeat(129) },
    ]) {
      await request(app.getHttpServer()).get(path).query(input).expect(400);
    }
    await request(app.getHttpServer())
      .get(path.replace(traceId, 'bad'))
      .expect(400);
    expect(query).not.toHaveBeenCalled();
  });
  it('rejects inaccessible projects before querying', async () => {
    owner.mockRejectedValue(new ForbiddenException());
    await request(app.getHttpServer()).get(path).expect(403);
    expect(query).not.toHaveBeenCalled();
  });
});

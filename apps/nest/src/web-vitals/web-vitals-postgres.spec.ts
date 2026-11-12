import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { Request } from 'express';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import type { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
import { WebVitals1793923200000 } from '../database/migrations/1793923200000-web-vitals';
import { WebVitalsService } from './web-vitals.service';
import { WebVitalsController } from './web-vitals.controller';
import { MetricsService } from '../metrics/metrics.service';
import type { WebVitalsEnvelope } from './web-vitals-contract';
import { MetricQueryPipe } from '../metrics/metrics-validation';
import { SPAN_FIELD_MAP } from '../traces/traces-contract';
const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  'Web Vitals PostgreSQL lifecycle and queries',
  () => {
    const schema = `vitals_test_${randomUUID().replaceAll('-', '')}`;
    const projectId = randomUUID();
    let admin: DataSource,
      db: DataSource,
      service: WebVitalsService,
      controller: WebVitalsController,
      metrics: MetricsService;
    const req = { user: { id: 'owner' } } as Request & { user: AuthUser };
    const projects = {
      findForIngestion: (_id: string, key: string) =>
        key === 'key'
          ? Promise.resolve({ id: projectId })
          : Promise.reject(new Error('denied')),
      getAccess: async () => ({ role: 'owner', permissions: [] }),
      findReadableBySlug: (user: string) =>
        user === 'owner'
          ? Promise.resolve({ id: projectId, slug: 'web' })
          : Promise.reject(new Error('denied')),
    } as unknown as MonitoringProjectsService;
    const start = '2026-11-06T00:00:00.000Z',
      end = '2026-11-07T00:00:00.000Z';
    beforeAll(async () => {
      admin = await new DataSource({ type: 'postgres', url }).initialize();
      await admin.query(`CREATE SCHEMA "${schema}"`);
      db = await new DataSource({
        type: 'postgres',
        url,
        schema,
        extra: { options: `-c search_path=${schema},public` },
      }).initialize();
      await db.query('CREATE TABLE monitoring_projects(id uuid PRIMARY KEY)');
      await db.query('INSERT INTO monitoring_projects VALUES($1)', [projectId]);
      await db.query(
        'CREATE TABLE monitoring_spans(project_id uuid,trace_id varchar(32),span_id varchar(16),is_transaction boolean,op text)',
      );
      await db.query(
        'CREATE TABLE monitoring_metrics(project_id uuid,event_id uuid,sample_index integer,name text,type text,unit text,value double precision,timestamp timestamptz,attributes jsonb,environment text,release text,trace_id text,span_id text)',
      );
      const runner = db.createQueryRunner();
      await new WebVitals1793923200000().up(runner);
      await runner.release();
      service = new WebVitalsService(db, projects);
      controller = new WebVitalsController(db, projects);
      metrics = new MetricsService(db, projects);
    });
    afterAll(async () => {
      if (db?.isInitialized) await db.destroy();
      if (admin?.isInitialized) {
        try {
          await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
        } finally {
          await admin.destroy();
        }
      }
    });
    const envelope = (
      pageId: string,
      name: 'LCP' | 'INP' | 'CLS',
      value: number,
      revision = 1,
    ): WebVitalsEnvelope => ({
      version: 1,
      type: 'web_vitals',
      eventId: randomUUID(),
      sentAt: start,
      page: {
        id: pageId,
        startedAt: start,
        route: '/checkout',
        navigationType: 'navigate',
        device: 'mobile',
        traceId: '1'.repeat(32),
      },
      measurements: [
        {
          name,
          value,
          revision,
          metricId: `${pageId}-${name}`,
          observedAt: start,
          attribution: {},
        },
      ],
    });
    it('deduplicates retry and stale revisions; aggregates canonical p75 and page counts', async () => {
      const pageId = randomUUID();
      const first = envelope(pageId, 'LCP', 1000);
      await service.ingest(projectId, 'key', { ...first, measurements: [] });
      await service.ingest(projectId, 'key', first);
      await service.ingest(projectId, 'key', first);
      await service.ingest(projectId, 'key', envelope(pageId, 'LCP', 5000, 2));
      await service.ingest(projectId, 'key', first);
      await service.ingest(projectId, 'key', envelope(pageId, 'INP', 150));
      await service.ingest(projectId, 'key', envelope(pageId, 'CLS', 0));
      const second = randomUUID();
      await service.ingest(projectId, 'key', envelope(second, 'LCP', 1000));
      const overview = (await controller.query(req, 'team', 'web', 'overview', {
        start,
        end,
      })) as {
        pageViews: number;
        completeSamples: number;
        passRate: number;
        metrics: { name: string; p75: number; count: number }[];
      };
      expect(overview.pageViews).toBe(2);
      expect(overview.completeSamples).toBe(1);
      expect(overview.passRate).toBe(0);
      expect(overview.metrics.find((v) => v.name === 'LCP')).toMatchObject({
        count: 2,
        p75: 4000,
      });
      expect(overview.metrics.find((v) => v.name === 'CLS')).toMatchObject({
        count: 1,
        p75: 0,
      });
      const result = await metrics.query(
        'owner',
        'team',
        'web',
        new MetricQueryPipe().transform({
          source: 'web_vitals',
          name: 'browser.web_vital.lcp.value',
          type: 'distribution',
          unit: 'ms',
          aggregation: 'p75',
          start,
          end,
        }),
      );
      expect(result.total).toBe(2);
      expect(result.aggregates[0].value).toBe(4000);
      const catalog = await metrics.catalog('owner', 'team', 'web');
      expect(catalog.items.some((v) => v.source === 'web_vitals')).toBe(true);
      const samples = (await controller.query(req, 'team', 'web', 'samples', {
        start,
        end,
        pageSize: '1',
      })) as { items: { traceAvailable: boolean }[]; total: number };
      expect(samples.total).toBe(2);
      expect(samples.items).toHaveLength(1);
      expect(samples.items[0].traceAvailable).toBe(false);
      await db.query(
        'INSERT INTO monitoring_spans(project_id,trace_id) VALUES($1,$2)',
        [projectId, '1'.repeat(32)],
      );
      const retained = (await controller.query(req, 'team', 'web', 'samples', {
        start,
        end,
      })) as { items: { traceAvailable: boolean }[] };
      expect(retained.items.every((v) => v.traceAvailable)).toBe(true);
      const pages = (await controller.query(req, 'team', 'web', 'pages', {
        start,
        end,
      })) as { items: { poorPageViews: number }[] };
      expect(pages.items[0].poorPageViews).toBe(1);
      const trend = (await controller.query(req, 'team', 'web', 'timeseries', {
        start,
        end,
        metric: 'LCP',
      })) as { items: { p75: number }[] };
      expect(trend.items[0].p75).toBe(4000);
      await expect(service.ingest(projectId, 'bad', first)).rejects.toThrow(
        'denied',
      );
      await expect(
        controller.query(
          { user: { id: 'other' } } as Request & { user: AuthUser },
          'team',
          'web',
          'overview',
          { start, end },
        ),
      ).rejects.toThrow('denied');
    });
    it('projects a vital once only onto its owning pageload transaction', async () => {
      const spanId = '2'.repeat(16);
      await db.query(
        `UPDATE monitoring_page_views SET dimensions=dimensions || jsonb_build_object('spanId',$1::text) WHERE id=(SELECT page_view_id FROM monitoring_web_vitals WHERE value=5000 LIMIT 1)`,
        [spanId],
      );
      await db.query(
        'INSERT INTO monitoring_spans VALUES($1,$2,$3,true,$4),($1,$2,$5,false,$6)',
        [
          projectId,
          '1'.repeat(32),
          spanId,
          'pageload',
          '3'.repeat(16),
          'http.client',
        ],
      );
      const field = SPAN_FIELD_MAP.get('browser.web_vital.lcp.value')!;
      const rows = await db.query<{ op: string; value: number | null }[]>(
        `SELECT op,${field.sql} AS value FROM monitoring_spans WHERE span_id IS NOT NULL ORDER BY op`,
      );
      expect(rows).toEqual([
        { op: 'http.client', value: null },
        { op: 'pageload', value: 5000 },
      ]);
      const aggregates = await db.query<{ value: number }[]>(
        `SELECT percentile_cont(0.75) WITHIN GROUP(ORDER BY ${field.sql}) AS value FROM monitoring_spans`,
      );
      expect(aggregates[0].value).toBe(5000);
    });
    it('ranks opportunities from canonical values and applies device filters', async () => {
      for(let i=0;i<5;i++) await service.ingest(projectId,'key',envelope(randomUUID(),'LCP',6000));
      const actions=await controller.query(req,'team','web','opportunities',{start,end,device:'mobile'}) as {items:{route:string;name:string;p75:number;poor:number;count:number}[]};
      expect(actions.items[0]).toMatchObject({route:'/checkout',name:'LCP',p75:6000,poor:6,count:7});
      const desktop=await controller.query(req,'team','web','overview',{start,end,device:'desktop'}) as {pageViews:number;passRate:number|null};
      expect(desktop.pageViews).toBe(0);expect(desktop.passRate).toBeNull();
    });
  },
);

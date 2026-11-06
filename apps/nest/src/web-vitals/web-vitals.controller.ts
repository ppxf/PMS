import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { DataSource } from 'typeorm';
import { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
import { isoTime } from '../traces/traces-validation';
import { VITAL_NAMES } from './web-vitals-contract';
const thresholds: Record<string, number[]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};
@Controller('groups/:groupSlug/projects/:projectSlug/web-vitals')
export class WebVitalsController {
  constructor(
    private readonly db: DataSource,
    private readonly projects: MonitoringProjectsService,
  ) {}
  @Get(':endpoint')
  async query(
    @Req() req: Request & { user: AuthUser },
    @Param('groupSlug') group: string,
    @Param('projectSlug') slug: string,
    @Param('endpoint') endpoint: string,
    @Query() q: Record<string, string>,
  ) {
    if (Object.values(q).some((value) => typeof value !== 'string'))
      throw new BadRequestException('Query values must be strings');
    if (
      ![
        'overview',
        'timeseries',
        'pages',
        'page-detail',
        'samples',
        'opportunities',
        'fields',
      ].includes(endpoint)
    )
      throw new BadRequestException('Unknown endpoint');
    const project = await this.projects.findOwnedBySlug(
      req.user.id,
      group,
      slug,
    );
    const end = q.end ? isoTime(q.end) : Date.now(),
      start = q.start
        ? isoTime(q.start)
        : end - (q.traceId ? 30 : 1) * 86400000;
    if (start >= end || end - start > 90 * 86400000)
      throw new BadRequestException('Invalid time range');
    const page = Number(q.page ?? 1),
      pageSize = Number(q.pageSize ?? 25),
      interval = Number(q.intervalSeconds ?? 3600);
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 10000 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100 ||
      !Number.isSafeInteger(interval) ||
      interval < 60 ||
      interval > 86400
    )
      throw new BadRequestException('Invalid pagination or interval');
    if (
      endpoint === 'timeseries' &&
      Math.ceil((end - start) / (interval * 1000)) + 1 > 2000
    )
      throw new BadRequestException(
        'Increase intervalSeconds for this time range',
      );
    if (q.metric && !VITAL_NAMES.includes(q.metric as never))
      throw new BadRequestException('Invalid metric');
    const args: unknown[] = [project.id, new Date(start), new Date(end)];
    let where = 'p.project_id=$1 AND p.started_at >= $2 AND p.started_at < $3';
    for (const key of [
      'environment',
      'release',
      'browser',
      'device',
      'route',
      'traceId',
    ])
      if (q[key]) {
        if (q[key].length > 2048)
          throw new BadRequestException('Invalid filter');
        args.push(q[key]);
        where += ` AND p.dimensions->>'${key}'=$${args.length}`;
      }
    const base = `FROM monitoring_page_views p LEFT JOIN monitoring_web_vitals v ON v.project_id=p.project_id AND v.page_view_id=p.id WHERE ${where}`;
    return this.db.transaction('REPEATABLE READ', async (m) => {
      await m.query("SET LOCAL statement_timeout='5000ms'");
      const metricRows = async (extra = '', params: unknown[] = args) =>
        m.query(
          `SELECT v.name,percentile_cont(0.75) WITHIN GROUP(ORDER BY v.value) AS p75,count(v.name)::int AS count,count(*) FILTER(WHERE v.value <= CASE v.name WHEN 'LCP' THEN 2500 WHEN 'INP' THEN 200 WHEN 'CLS' THEN 0.1 WHEN 'FCP' THEN 1800 ELSE 800 END)::int AS good,count(*) FILTER(WHERE v.value > CASE v.name WHEN 'LCP' THEN 4000 WHEN 'INP' THEN 500 WHEN 'CLS' THEN 0.25 WHEN 'FCP' THEN 3000 ELSE 1800 END)::int AS poor ${base} ${extra} GROUP BY v.name`,
          params,
        );
      const totals = await m.query(
        `SELECT count(DISTINCT p.id)::int AS count,greatest(max(p.received_at),max(v.received_at)) AS last ${base}`,
        args,
      );
      const pageViews = totals[0].count as number;
      const shape = (
        rows: {
          name: string;
          count: number;
          good: number;
          poor: number;
          p75: number | null;
        }[],
        denominator: number,
      ) =>
        VITAL_NAMES.map((name) => {
          const r = rows.find((r) => r.name === name);
          const count = Number(r?.count ?? 0),
            good = Number(r?.good ?? 0),
            poor = Number(r?.poor ?? 0);
          return {
            name,
            p75: r?.p75 == null ? null : Number(r.p75),
            count,
            good,
            poor,
            needsImprovement: count - good - poor,
            coverage: denominator ? count / denominator : 0,
          };
        });
      if (endpoint === 'fields')
        return {
          fields: [
            'environment',
            'release',
            'device',
            'browser',
            'route',
            'traceId',
          ].map((key) => ({ key, type: 'string', category: 'Web Vitals' })),
          metrics: VITAL_NAMES,
        };
      if (endpoint === 'overview' || endpoint === 'page-detail') {
        const rows = await metricRows();
        const c = await m.query(
          `SELECT count(*) FILTER(WHERE n=3)::int AS complete,count(*) FILTER(WHERE n=3 AND passing)::int AS passing FROM (SELECT p.id,count(*) FILTER(WHERE v.name IN ('LCP','INP','CLS')) AS n,bool_and(v.value <= CASE v.name WHEN 'LCP' THEN 2500 WHEN 'INP' THEN 200 WHEN 'CLS' THEN 0.1 ELSE NULL END) AS passing ${base} GROUP BY p.id) s`,
          args,
        );
        const complete = Number(c[0].complete);
        return {
          pageViews,
          completeSamples: complete,
          passingSamples: Number(c[0].passing),
          passRate: complete ? Number(c[0].passing) / complete : null,
          coverage: pageViews ? complete / pageViews : 0,
          metrics: shape(rows, pageViews),
          lastReceivedAt: totals[0].last,
        };
      }
      if (endpoint === 'timeseries') {
        const a = [...args, interval];
        return {
          items: await m.query(
            `SELECT to_timestamp(floor(extract(epoch FROM p.started_at)/$${a.length})*$${a.length}) AS timestamp,v.name,percentile_cont(0.75) WITHIN GROUP(ORDER BY v.value) AS p75,count(*)::int AS count ${base} AND v.name IS NOT NULL ${q.metric ? `AND v.name='${q.metric}'` : ''} GROUP BY 1,v.name ORDER BY 1,v.name LIMIT 11000`,
            a,
          ),
        };
      }
      if (endpoint === 'samples') {
        const ids = await m.query(
          `SELECT p.id,p.started_at,p.dimensions,EXISTS(SELECT 1 FROM monitoring_spans s WHERE s.project_id=p.project_id AND s.trace_id=p.dimensions->>'traceId') AS trace_available ${base} GROUP BY p.project_id,p.id ORDER BY p.started_at DESC,p.id LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
          args,
        );
        const items = [];
        for (const p of ids) {
          const measurements = await m.query(
            'SELECT name,metric_id AS "metricId",revision::int,value,observed_at AS "observedAt",attribution FROM monitoring_web_vitals WHERE project_id=$1 AND page_view_id=$2 ORDER BY name',
            [project.id, p.id],
          );
          items.push({
            pageViewId: p.id,
            startedAt: p.started_at,
            route: p.dimensions.route,
            traceId: p.dimensions.traceId,
            spanId: p.dimensions.spanId,
            traceAvailable: Boolean(p.trace_available),
            measurements,
          });
        }
        return { items, total: pageViews, page, pageSize };
      }
      if (endpoint === 'opportunities') {
        const rows = await m.query(
          `SELECT p.dimensions->>'route' AS route,v.name,percentile_cont(0.75) WITHIN GROUP(ORDER BY v.value) AS p75,count(*)::int AS count,count(*) FILTER(WHERE v.value > CASE v.name WHEN 'LCP' THEN 4000 WHEN 'INP' THEN 500 WHEN 'CLS' THEN 0.25 WHEN 'FCP' THEN 3000 ELSE 1800 END)::int AS poor ${base} AND v.name IS NOT NULL GROUP BY 1,v.name HAVING count(*)>=5 AND count(*) FILTER(WHERE v.value > CASE v.name WHEN 'LCP' THEN 4000 WHEN 'INP' THEN 500 WHEN 'CLS' THEN 0.25 WHEN 'FCP' THEN 3000 ELSE 1800 END)>0 ORDER BY poor DESC,count(*) DESC,1,2 LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
          args,
        );
        return {
          items: rows.map((r: { name: string }) => ({
            ...r,
            threshold: thresholds[r.name][1],
          })),
        };
      }
      const routes = await m.query(
        `SELECT p.dimensions->>'route' AS route,count(DISTINCT p.id)::int AS count,count(DISTINCT p.id) FILTER(WHERE v.name IN ('LCP','INP','CLS') AND v.value > CASE v.name WHEN 'LCP' THEN 4000 WHEN 'INP' THEN 500 ELSE 0.25 END) AS priority ${base} GROUP BY 1 ORDER BY priority DESC,count(DISTINCT p.id) DESC,1 LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
        args,
      );
      const items = [];
      for (const r of routes) {
        const a = [...args, r.route];
        const rows = await metricRows(
          `AND p.dimensions->>'route'=$${a.length}`,
          a,
        );
        const metrics = shape(rows, Number(r.count));
        items.push({
          route: r.route,
          pageViews: Number(r.count),
          metrics,
          poorPageViews: Number(
            (
              await m.query(
                `SELECT count(DISTINCT p.id)::int AS count ${base} AND p.dimensions->>'route'=$${a.length} AND v.value > CASE v.name WHEN 'LCP' THEN 4000 WHEN 'INP' THEN 500 WHEN 'CLS' THEN 0.25 WHEN 'FCP' THEN 3000 ELSE 1800 END`,
                a,
              )
            )[0].count,
          ),
        });
      }
      const total = await m.query(
        `SELECT count(DISTINCT p.dimensions->>'route')::int AS count ${base}`,
        args,
      );
      return { items, total: Number(total[0].count), page, pageSize };
    });
  }
}

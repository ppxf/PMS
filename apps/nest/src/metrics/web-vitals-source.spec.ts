import { MetricQueryPipe } from './metrics-validation';
import { MetricsService } from './metrics.service';
import type { DataSource } from 'typeorm';
import type { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
const input = {
  source: 'web_vitals',
  name: 'browser.web_vital.lcp.value',
  type: 'distribution',
  unit: 'ms',
  aggregation: 'p75',
  start: '2026-11-06T00:00:00Z',
  end: '2026-11-07T00:00:00Z',
};
const projects = {
  findReadableBySlug: () =>
    Promise.resolve({ id: 'project', metricsEnabled: false }),
} as unknown as MonitoringProjectsService;
it('accepts automatic Web Vitals as an independent Metrics source', () => {
  expect(new MetricQueryPipe().transform(input)).toMatchObject(input);
});
it.each([
  ['lcp', 'ms'],
  ['inp', 'ms'],
  ['cls', 'none'],
  ['fcp', 'ms'],
  ['ttfb', 'ms'],
])('accepts automatic %s measurements', (name, unit) => {
  expect(
    new MetricQueryPipe().transform({
      ...input,
      name: `browser.web_vital.${name}.value`,
      unit,
    }).source,
  ).toBe('web_vitals');
});
it('bounds metric discovery to the selected window', async () => {
  const query = jest.fn<Promise<unknown[]>, [string, unknown[]?]>(() =>
    Promise.resolve([]),
  );
  const service = new MetricsService(
    {
      transaction: (action: (m: unknown) => unknown) => action({ query }),
    } as unknown as DataSource,
    projects,
  );
  await service.catalog('user', 'group', 'project', input);
  for (const [sql, args] of query.mock.calls.filter(([sql]) =>
    sql.startsWith('SELECT'),
  )) {
    expect(sql).toContain('timestamp >= $2 AND timestamp < $3');
    expect(args).toEqual([
      'project',
      new Date(input.start),
      new Date(input.end),
    ]);
  }
  await expect(
    service.catalog('user', 'group', 'project', {
      start: input.end,
      end: input.start,
    }),
  ).rejects.toThrow();
});
it('discovers automatic measurements even when custom metrics are disabled', async () => {
  const query = jest.fn<Promise<unknown[]>, [string]>(() =>
    Promise.resolve([]),
  );
  const service = new MetricsService(
    {
      transaction: (action: (m: unknown) => unknown) => action({ query }),
    } as unknown as DataSource,
    projects,
  );
  await service.catalog('user', 'group', 'project');
  expect(query.mock.calls.flat().join(' ')).toContain('monitoring_web_vitals');
});
it('queries automatic samples and aggregates across page views without writes', async () => {
  const query = jest.fn((sql: string) => {
    if (sql.includes('AS total')) return Promise.resolve([{ total: 0 }]);
    return Promise.resolve([]);
  });
  const service = new MetricsService(
    {
      transaction: (_level: string, action: (m: unknown) => unknown) =>
        action({ query }),
    } as unknown as DataSource,
    projects,
  );
  const result = await service.query(
    'user',
    'group',
    'project',
    new MetricQueryPipe().transform(input),
  );
  expect(result.total).toBe(0);
  const reads = query.mock.calls
    .map(([sql]) => sql)
    .filter((sql) => sql.startsWith('SELECT'));
  expect(reads.length).toBeGreaterThanOrEqual(3);
  for (const sql of reads) {
    expect(sql).toContain('monitoring_web_vitals');
    expect(sql).toContain('monitoring_page_views');
    expect(sql).not.toMatch(/INSERT|UPDATE|DELETE/);
  }
});

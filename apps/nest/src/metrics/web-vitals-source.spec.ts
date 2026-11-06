import { MetricQueryPipe } from './metrics-validation';
import { MetricsService } from './metrics.service';
import type { DataSource } from 'typeorm';
import type { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
it('lists built-in Web Vitals and typed attribution fields before any sample arrives', async () => {
  const service = new MetricsService(
    {
      transaction: (action: (m: unknown) => unknown) =>
        action({ query: () => Promise.resolve([]) }),
    } as unknown as DataSource,
    {
      findOwnedBySlug: () =>
        Promise.resolve({ id: 'project', metricsEnabled: false }),
    } as unknown as MonitoringProjectsService,
  );
  const result = await service.catalog('user', 'group', 'project');
  expect(
    result.items.filter((item) => item.source === 'web_vitals'),
  ).toHaveLength(5);
  expect(
    result.items.find((item) => item.name === 'browser.web_vital.lcp.value'),
  ).toMatchObject({
    sampleCount: 0,
    lastSeen: null,
    type: 'distribution',
    unit: 'ms',
  });
  expect(
    result.filterFields.find((field) => field.key === 'attributes.inputDelay'),
  ).toMatchObject({
    type: 'number',
    operators: expect.arrayContaining(['gt']),
  });
});
it('accepts p75 on the canonical Web Vitals source and queries latest values', async () => {
  const input = {
    source: 'web_vitals',
    name: 'browser.web_vital.lcp.value',
    type: 'distribution',
    unit: 'ms',
    aggregation: 'p75',
    start: '2026-11-06T00:00:00Z',
    end: '2026-11-06T01:00:00Z',
  };
  const q = new MetricQueryPipe().transform(input);
  expect(q).toMatchObject({ source: 'web_vitals', aggregation: 'p75' });
  const query = jest.fn((sql: string) =>
    Promise.resolve(sql.includes('AS total') ? [{ total: 0 }] : []),
  );
  const service = new MetricsService(
    {
      transaction: (_level: unknown, action: (m: unknown) => unknown) =>
        action({ query }),
    } as unknown as DataSource,
    {
      findOwnedBySlug: () => Promise.resolve({ id: 'project' }),
    } as unknown as MonitoringProjectsService,
  );
  await service.query('user', 'group', 'project', q);
  expect(
    query.mock.calls.some(([sql]) => sql.includes('monitoring_web_vitals')),
  ).toBe(true);
  expect(
    query.mock.calls.some(([sql]) => sql.includes('percentile_cont(0.75)')),
  ).toBe(true);
});

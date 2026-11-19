import { MetricQueryPipe } from './metrics-validation';
import { MetricsService } from './metrics.service';
import type { DataSource } from 'typeorm';
import type { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';

it.each([false, true])(
  'does not synthesize Web Vitals in Metrics when enabled=%s',
  async (metricsEnabled) => {
    const query = jest.fn(() => Promise.resolve([]));
    const service = new MetricsService(
      {
        transaction: (action: (m: unknown) => unknown) => action({ query }),
      } as unknown as DataSource,
      {
        getAccess: async () => ({ role: 'owner', permissions: [] }),
        findReadableBySlug: async () => ({ id: 'project', metricsEnabled }),
      } as unknown as MonitoringProjectsService,
    );
    const result = await service.catalog('user', 'group', 'project');
    expect(result.items).toEqual([]);
    expect(result.attributes).toEqual([]);
    expect(result.enabled).toBe(metricsEnabled);
    expect(query.mock.calls.flat().join(' ')).not.toContain(
      'monitoring_web_vitals',
    );
  },
);
it('rejects Web Vitals as a Metrics query source', () => {
  expect(() =>
    new MetricQueryPipe().transform({
      source: 'web_vitals',
      name: 'browser.web_vital.lcp.value',
      type: 'distribution',
      unit: 'ms',
      aggregation: 'p75',
      start: '2026-11-06T00:00:00Z',
      end: '2026-11-06T01:00:00Z',
    }),
  ).toThrow();
});

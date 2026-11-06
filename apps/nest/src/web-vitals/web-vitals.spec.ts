import { WebVitalsEnvelopePipe } from './web-vitals-contract';
import { WebVitalsService } from './web-vitals.service';
import type { DataSource } from 'typeorm';
import type { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
const envelope = () => ({
  version: 1 as const,
  type: 'web_vitals' as const,
  eventId: 'd012b17f-9ed9-443c-8943-434576a79d51',
  sentAt: '2026-11-06T12:00:00Z',
  page: {
    id: 'a012b17f-9ed9-443c-8943-434576a79d51',
    startedAt: '2026-11-06T11:00:00Z',
    route: '/',
    navigationType: 'navigate',
  },
  measurements: [
    {
      name: 'LCP' as const,
      metricId: 'metric',
      revision: 1,
      value: 2500,
      observedAt: '2026-11-06T11:00:03Z',
      attribution: {},
    },
  ],
});
describe('Web Vitals validation and ingestion', () => {
  const pipe = new WebVitalsEnvelopePipe();
  it('accepts page-only lifecycle envelopes', () => {
    const e = envelope();
    e.measurements = [];
    expect(pipe.transform(e)).toEqual(e);
  });
  it.each([0, -1, 1.2, Infinity, 2147483648])('rejects revision %s', (revision) => {
    const e = envelope();
    e.measurements[0].revision = revision;
    expect(() => pipe.transform(e)).toThrow();
  });
  it('rejects nested attribution and duplicate measurements', () => {
    const e = envelope();
    e.measurements.push(e.measurements[0]);
    expect(() => pipe.transform(e)).toThrow();
    const b = envelope();
    expect(() =>
      pipe.transform({
        ...b,
        measurements: [{ ...b.measurements[0], attribution: { nested: {} } }],
      }),
    ).toThrow();
  });
  it('rejects unknown fields and non-finite values', () => {
    expect(() => pipe.transform({ ...envelope(), extra: true })).toThrow();
    const e = envelope();
    e.measurements[0].value = NaN;
    expect(() => pipe.transform(e)).toThrow();
  });
  function setup(previous: unknown[] = []) {
    const query = jest.fn().mockResolvedValue([]);
    query.mockImplementation((sql: string) =>
      Promise.resolve(sql.startsWith('SELECT dimensions') ? previous : []),
    );
    const transaction = jest.fn(
      (fn: (manager: { query: typeof query }) => Promise<void>) =>
        fn({ query }),
    );
    const findForIngestion = jest
      .fn()
      .mockResolvedValue({ metricsEnabled: false, tracingEnabled: false });
    const service = new WebVitalsService(
      { transaction } as unknown as DataSource,
      { findForIngestion } as unknown as MonitoringProjectsService,
    );
    return { service, query, transaction, findForIngestion };
  }
  it('authenticates before writing and ignores feature enable flags', async () => {
    const s = setup();
    await s.service.ingest('p', 'key', envelope());
    expect(s.findForIngestion).toHaveBeenCalledWith('p', 'key');
    expect(s.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      expect.anything(),
    );
  });
  it('does not write when authentication fails', async () => {
    const s = setup();
    s.findForIngestion.mockRejectedValue(new Error('denied'));
    await expect(s.service.ingest('p', 'bad', envelope())).rejects.toThrow(
      'denied',
    );
    expect(s.transaction).not.toHaveBeenCalled();
  });
  it('rejects changing immutable page dimensions', async () => {
    const s = setup([{ dimensions: { ...envelope().page, route: '/other' } }]);
    await expect(s.service.ingest('p', 'key', envelope())).rejects.toThrow(
      'immutable',
    );
    expect(
      s.query.mock.calls.some((c) => String(c[0]).startsWith('INSERT')),
    ).toBe(false);
  });
  it('uses strict monotonic revision update and stable metric identity', async () => {
    const s = setup();
    await s.service.ingest('p', 'key', envelope());
    expect(s.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'monitoring_web_vitals.revision < EXCLUDED.revision AND monitoring_web_vitals.metric_id = EXCLUDED.metric_id',
      ),
      expect.arrayContaining(['LCP', 'metric', 1, 2500]),
    );
  });
});

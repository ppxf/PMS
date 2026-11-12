import { evaluateAlerts } from './workspace-alert-evaluator';

describe('alert window aggregation', () => {
  it('scans each distinct project window once for rules sharing that window', async () => {
    const rules = ['one','two'].map(id => ({ id, project_id: 'project', kind: 'error_threshold', window_minutes: 5, threshold: 2, name: id }));
    const query = jest.fn((sql: string) => Promise.resolve(sql.includes('pg_try_advisory') ? [{locked:true}] : sql.includes('SELECT * FROM workspace_alert_rules') ? rules : sql.includes('monitoring_events') ? [{ project_id: 'project', window_minutes: 5, count: '3' }] : []));
    await evaluateAlerts({ transaction: (work: (m: unknown) => Promise<void>) => work({query}) } as never);
    const scans = query.mock.calls.filter(([sql]) => sql.includes('monitoring_events'));
    expect(scans).toHaveLength(1);
    expect(query.mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO workspace_alerts'))).toHaveLength(2);
  });
});

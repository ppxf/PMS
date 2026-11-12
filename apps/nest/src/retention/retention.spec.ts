import { ConfigService } from '@nestjs/config';
import { RetentionService } from './retention.service';

describe('monitoring retention', () => {
  it('defaults to a thirty day dry run and preserves latest issue evidence and audit history', async () => {
    const db = { query: jest.fn().mockResolvedValue([{ count: '2' }]) };
    const result = await new RetentionService(
      db as never,
      new ConfigService(),
    ).cleanup(false, new Date('2026-11-12T00:00:00Z'));
    expect(result.cutoff).toBe('2026-10-13T00:00:00.000Z');
    expect(result.executed).toBe(false);
    expect(result.counts.monitoring_events).toBe(2);
    expect(db.query.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(
      true,
    );
    const eventSql = db.query.mock.calls.find(([sql]) =>
      sql.includes('FROM monitoring_events'),
    )![0];
    expect(eventSql).toContain('latest_event_id');
    expect(
      db.query.mock.calls.find(([sql]) =>
        sql.includes('FROM monitoring_page_views'),
      )![0],
    ).toContain('w.received_at >= $1');
    expect(db.query.mock.calls.some(([sql]) => /audit_records/.test(sql))).toBe(
      false,
    );
  });
  it('deletes in bounded statements until no eligible rows remain', async () => {
    const db = {
      query: jest.fn((sql: string) =>
        Promise.resolve(
          sql.startsWith('SELECT') ? [{ count: '2' }] : [{ count: '0' }],
        ),
      ),
    };
    const transactionalDb = {
      ...db,
      transaction: (work: (manager: unknown) => Promise<unknown>) => work(db),
    };
    const result = await new RetentionService(
      transactionalDb as never,
      new ConfigService({ retention: { batchSize: 2 } }),
    ).cleanup(true);
    expect(result.executed).toBe(true);
    expect(
      db.query.mock.calls
        .filter(([sql]) => sql.startsWith('WITH'))
        .every(
          ([sql]) => sql.includes('LIMIT $2') && sql.includes('RETURNING'),
        ),
    ).toBe(true);
  });
});

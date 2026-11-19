import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { MergeErrorIssues1795046400000 } from './migrations/1795046400000-merge-error-issues';
import { createErrorFingerprint } from '../monitoring-events/fingerprint';

const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
(url ? describe : describe.skip)('error issue merge on PostgreSQL', () => {
  let db: DataSource;
  const schema = `issue_merge_${randomUUID().replaceAll('-', '')}`;
  beforeAll(async () => {
    db = await new DataSource({ type: 'postgres', url }).initialize();
    await db.query(`CREATE SCHEMA "${schema}"`);
  });
  afterAll(async () => {
    if (db?.isInitialized) {
      await db.query(`DROP SCHEMA "${schema}" CASCADE`);
      await db.destroy();
    }
  });
  it('merges identities, counts, events and alerts while preserving project and environment boundaries', async () => {
    const q = db.createQueryRunner();
    await q.connect();
    await q.startTransaction();
    try {
      await q.query(`SET LOCAL search_path TO "${schema}",public`);
      await q.query(`CREATE TABLE monitoring_error_issues(
        id uuid PRIMARY KEY, project_id uuid,environment text,fingerprint char(64),exception_type text,title text,culprit text,
        status text,resolved_at timestamptz,resolution_reason text,visibility text,archive_threshold int,archived_at timestamptz,
        first_seen_at timestamptz,last_seen_at timestamptz,reopened_at timestamptz,reopen_count int,event_count int,
        latest_event_id uuid,created_at timestamptz,updated_at timestamptz,UNIQUE(project_id,environment,fingerprint))`);
      await q.query(
        'CREATE TABLE monitoring_events(id uuid PRIMARY KEY,issue_id uuid REFERENCES monitoring_error_issues(id) ON DELETE CASCADE)',
      );
      await q.query(
        'CREATE TABLE workspace_alerts(id uuid PRIMARY KEY,issue_id uuid REFERENCES monitoring_error_issues(id) ON DELETE SET NULL)',
      );
      await q.query(
        `CREATE TABLE monitoring_error_suppressions(project_id uuid,environment text,fingerprint char(64),UNIQUE(project_id,environment,fingerprint))`,
      );
      const project = randomUUID(),
        otherProject = randomUUID();
      const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
      for (let i = 0; i < 4; i++) {
        await q.query(
          `INSERT INTO monitoring_error_issues(id,project_id,environment,fingerprint,exception_type,title,status,visibility,first_seen_at,last_seen_at,reopen_count,event_count,created_at)
          VALUES($1,$2,$3,$4,'Error',$5,$6,'active',$7,$7,0,2,$7)`,
          [
            ids[i],
            i === 3 ? otherProject : project,
            i === 2 ? 'production' : 'development',
            String(i).repeat(64),
            i === 1 ? ' repeated   error ' : 'repeated error',
            i === 0 ? 'resolved' : 'unresolved',
            `2026-11-${10 + i}T00:00:00Z`,
          ],
        );
        await q.query('INSERT INTO monitoring_events VALUES($1,$2)', [
          randomUUID(),
          ids[i],
        ]);
      }
      await q.query('INSERT INTO workspace_alerts VALUES($1,$2)', [
        randomUUID(),
        ids[1],
      ]);
      await q.query(
        'INSERT INTO monitoring_error_suppressions VALUES($1,$2,$3)',
        [project, 'development', '1'.repeat(64)],
      );
      await new MergeErrorIssues1795046400000().up(q);
      const issues = await q.query('SELECT * FROM monitoring_error_issues');
      expect(issues).toHaveLength(3);
      const merged = issues.find((i: { id: string }) => i.id === ids[0]);
      expect(merged).toMatchObject({
        event_count: 4,
        status: 'unresolved',
        fingerprint: createErrorFingerprint({
          exceptionType: 'Error',
          message: 'repeated error',
        }),
      });
      expect(merged.first_seen_at.toISOString()).toBe(
        '2026-11-11T00:00:00.000Z',
      );
      expect(merged.last_seen_at.toISOString()).toBe(
        '2026-11-11T00:00:00.000Z',
      );
      expect(await q.query('SELECT id FROM monitoring_events')).toHaveLength(4);
      expect(await q.query('SELECT issue_id FROM workspace_alerts')).toEqual([
        { issue_id: ids[0] },
      ]);
      expect(
        await q.query(
          'SELECT issue_id FROM monitoring_events WHERE issue_id=$1',
          [ids[0]],
        ),
      ).toHaveLength(2);
      expect(
        await q.query(
          'SELECT fingerprint FROM monitoring_error_suppressions WHERE fingerprint=$1',
          [merged.fingerprint],
        ),
      ).toHaveLength(1);
    } finally {
      await q.rollbackTransaction();
      await q.release();
    }
  });
});

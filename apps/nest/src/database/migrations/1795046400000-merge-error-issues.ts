import { createHash } from 'node:crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

/** Re-key existing issues without discarding their events or alert references. */
export class MergeErrorIssues1795046400000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    // Run in the migration transaction, blocking ingestion until identities agree.
    await q.query(
      'LOCK TABLE monitoring_error_issues, monitoring_events, monitoring_error_suppressions, workspace_alerts IN SHARE ROW EXCLUSIVE MODE',
    );
    await q.query(`CREATE TEMP TABLE error_issue_merge_map (
      id uuid PRIMARY KEY, project_id uuid, environment text, old_fingerprint text,
      fingerprint text, keeper uuid
    ) ON COMMIT DROP`);
    const issues: {
      id: string;
      project_id: string;
      environment: string;
      fingerprint: string;
      exception_type: string;
      title: string;
    }[] = await q.query(
      'SELECT id, project_id, environment, fingerprint, exception_type, title FROM monitoring_error_issues ORDER BY created_at, id',
    );
    const keepers = new Map<string, string>();
    for (const issue of issues) {
      // Freeze this version of the identity algorithm inside the migration.
      const fingerprint = createHash('sha256')
        .update(
          [issue.exception_type, issue.title.trim().replace(/\s+/gu, ' ')].join(
            '\n',
          ),
        )
        .digest('hex');
      const scope = JSON.stringify([
        issue.project_id,
        issue.environment,
        fingerprint,
      ]);
      const keeper = keepers.get(scope) ?? issue.id;
      keepers.set(scope, keeper);
      await q.query(
        'INSERT INTO error_issue_merge_map VALUES ($1,$2,$3,$4,$5,$6)',
        [
          issue.id,
          issue.project_id,
          issue.environment,
          issue.fingerprint,
          fingerprint,
          keeper,
        ],
      );
    }
    await q.query(
      `UPDATE monitoring_events e SET issue_id=m.keeper FROM error_issue_merge_map m WHERE e.issue_id=m.id AND m.id<>m.keeper`,
    );
    await q.query(
      `UPDATE workspace_alerts a SET issue_id=m.keeper FROM error_issue_merge_map m WHERE a.issue_id=m.id AND m.id<>m.keeper`,
    );
    await q.query(`INSERT INTO monitoring_error_suppressions(project_id,environment,fingerprint)
      SELECT DISTINCT s.project_id,s.environment,m.fingerprint FROM monitoring_error_suppressions s
      JOIN error_issue_merge_map m ON s.project_id=m.project_id AND s.environment=m.environment AND s.fingerprint=m.old_fingerprint
      ON CONFLICT (project_id,environment,fingerprint) DO NOTHING`);
    await q.query(`WITH grouped AS (
      SELECT m.keeper, sum(i.event_count)::int AS event_count, sum(i.reopen_count)::int AS reopen_count,
        bool_or(i.status='unresolved') AS unresolved, bool_or(i.visibility='active') AS active,
        coalesce(min(i.first_seen_at) FILTER (WHERE i.status='unresolved'),min(i.first_seen_at)) AS first_seen_at,
        max(i.last_seen_at) AS last_seen_at, max(i.reopened_at) AS reopened_at,
        (array_agg(i.id ORDER BY i.last_seen_at DESC,i.id))[1] AS newest
      FROM monitoring_error_issues i JOIN error_issue_merge_map m ON m.id=i.id GROUP BY m.keeper
    ) UPDATE monitoring_error_issues i SET
      event_count=g.event_count,reopen_count=g.reopen_count,first_seen_at=g.first_seen_at,last_seen_at=g.last_seen_at,
      reopened_at=g.reopened_at,latest_event_id=n.latest_event_id,title=n.title,culprit=n.culprit,
      status=CASE WHEN g.unresolved THEN 'unresolved' ELSE n.status END,
      resolved_at=CASE WHEN g.unresolved THEN NULL ELSE n.resolved_at END,
      resolution_reason=CASE WHEN g.unresolved THEN NULL ELSE n.resolution_reason END,
      visibility=CASE WHEN g.active OR (n.visibility='archived_until_count' AND g.event_count>=n.archive_threshold) THEN 'active' ELSE n.visibility END,
      archive_threshold=CASE WHEN g.active OR (n.visibility='archived_until_count' AND g.event_count>=n.archive_threshold) THEN NULL ELSE n.archive_threshold END,
      archived_at=CASE WHEN g.active OR (n.visibility='archived_until_count' AND g.event_count>=n.archive_threshold) THEN NULL ELSE n.archived_at END,
      updated_at=now()
      FROM grouped g JOIN monitoring_error_issues n ON n.id=g.newest WHERE i.id=g.keeper`);
    await q.query(
      'DELETE FROM monitoring_error_issues i USING error_issue_merge_map m WHERE i.id=m.id AND m.id<>m.keeper',
    );
    await q.query(
      'UPDATE monitoring_error_issues i SET fingerprint=m.fingerprint FROM error_issue_merge_map m WHERE i.id=m.id AND m.id=m.keeper',
    );
  }
  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Issue aggregation cannot be reversed without a database backup; original events are preserved.',
      ),
    );
  }
}

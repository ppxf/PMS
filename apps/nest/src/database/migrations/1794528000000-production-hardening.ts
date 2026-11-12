import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductionHardening1794528000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      'CREATE INDEX monitoring_error_issues_latest_event ON monitoring_error_issues(latest_event_id)',
    );
    await q.query(
      'ALTER TABLE users ADD COLUMN session_version integer NOT NULL DEFAULT 0',
    );
    await q.query(
      'CREATE INDEX monitoring_events_project_received ON monitoring_events(project_id, received_at)',
    );
    await q.query(
      'CREATE INDEX monitoring_events_project_time ON monitoring_events(project_id, timestamp)',
    );
    await q.query(
      'CREATE INDEX monitoring_events_received ON monitoring_events(received_at)',
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP INDEX monitoring_error_issues_latest_event');
    await q.query('DROP INDEX monitoring_events_received');
    await q.query('DROP INDEX monitoring_events_project_time');
    await q.query('DROP INDEX monitoring_events_project_received');
    await q.query('ALTER TABLE users DROP COLUMN session_version');
  }
}

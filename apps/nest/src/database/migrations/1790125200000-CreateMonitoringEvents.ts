import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMonitoringEvents1790125200000 implements MigrationInterface {
  name = 'CreateMonitoringEvents1790125200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE monitoring_error_issues (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        project_id uuid NOT NULL,
        fingerprint char(64) NOT NULL,
        title varchar(2000) NOT NULL,
        exception_type varchar(128) NOT NULL,
        culprit varchar(512),
        status varchar(16) NOT NULL DEFAULT 'unresolved',
        event_count integer NOT NULL DEFAULT 1,
        first_seen_at timestamptz NOT NULL,
        last_seen_at timestamptz NOT NULL,
        latest_event_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_monitoring_error_issues_project
          FOREIGN KEY (project_id) REFERENCES monitoring_projects(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE monitoring_events (
        id uuid PRIMARY KEY,
        project_id uuid NOT NULL,
        issue_id uuid NOT NULL,
        timestamp timestamptz NOT NULL,
        received_at timestamptz NOT NULL,
        source varchar(32) NOT NULL,
        level varchar(16) NOT NULL,
        message varchar(2000) NOT NULL,
        exception_type varchar(128) NOT NULL,
        exception_value varchar(2000) NOT NULL,
        stacktrace text,
        url varchar(2048),
        environment varchar(128),
        release varchar(128),
        tags jsonb NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT fk_monitoring_events_project
          FOREIGN KEY (project_id) REFERENCES monitoring_projects(id) ON DELETE CASCADE,
        CONSTRAINT fk_monitoring_events_issue
          FOREIGN KEY (issue_id) REFERENCES monitoring_error_issues(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      ALTER TABLE monitoring_error_issues
      ADD CONSTRAINT fk_monitoring_error_issues_latest_event
      FOREIGN KEY (latest_event_id) REFERENCES monitoring_events(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_monitoring_error_issues_project_fingerprint
      ON monitoring_error_issues (project_id, fingerprint)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_monitoring_error_issues_project_last_seen
      ON monitoring_error_issues (project_id, last_seen_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_monitoring_events_project_received
      ON monitoring_events (project_id, received_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_monitoring_events_issue_received
      ON monitoring_events (issue_id, received_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX idx_monitoring_events_issue_received');
    await queryRunner.query(
      'DROP INDEX idx_monitoring_events_project_received',
    );
    await queryRunner.query(
      'DROP INDEX idx_monitoring_error_issues_project_last_seen',
    );
    await queryRunner.query(
      'DROP INDEX uq_monitoring_error_issues_project_fingerprint',
    );
    await queryRunner.query(`
      ALTER TABLE monitoring_error_issues
      DROP CONSTRAINT fk_monitoring_error_issues_latest_event
    `);
    await queryRunner.query('DROP TABLE monitoring_events');
    await queryRunner.query('DROP TABLE monitoring_error_issues');
  }
}

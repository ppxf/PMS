import { MigrationInterface, QueryRunner } from 'typeorm';
export class WorkspaceAlerts1794441600001 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE workspace_alert_rules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid NOT NULL REFERENCES monitoring_projects(id) ON DELETE CASCADE,name varchar(128) NOT NULL,kind varchar(32) NOT NULL CHECK(kind IN ('new_issue','reopened_issue','error_threshold')),threshold integer NOT NULL DEFAULT 1 CHECK(threshold BETWEEN 1 AND 1000000),window_minutes integer NOT NULL DEFAULT 5 CHECK(window_minutes BETWEEN 1 AND 10080),enabled boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now())`,
    );
    await q.query(
      `CREATE TABLE workspace_alerts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid NOT NULL REFERENCES monitoring_projects(id) ON DELETE CASCADE,rule_id uuid NOT NULL REFERENCES workspace_alert_rules(id) ON DELETE CASCADE,kind varchar(32) NOT NULL,title varchar(128) NOT NULL,issue_id uuid REFERENCES monitoring_error_issues(id) ON DELETE SET NULL,dedup_key text NOT NULL,status varchar(16) NOT NULL DEFAULT 'open' CHECK(status IN ('open','recovered')),created_at timestamptz NOT NULL DEFAULT now(),recovered_at timestamptz,acknowledged_at timestamptz,acknowledged_by uuid REFERENCES users(id) ON DELETE SET NULL,UNIQUE(rule_id,dedup_key))`,
    );
    await q.query(
      `CREATE UNIQUE INDEX workspace_alert_threshold_open ON workspace_alerts(rule_id) WHERE status='open' AND kind='error_threshold'`,
    );
    await q.query(
      `CREATE INDEX workspace_alerts_project_time ON workspace_alerts(project_id,created_at DESC)`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE workspace_alerts');
    await q.query('DROP TABLE workspace_alert_rules');
  }
}

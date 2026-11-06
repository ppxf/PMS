import { MigrationInterface, QueryRunner } from 'typeorm';
export class WebVitals1793923200000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE monitoring_page_views (project_id uuid NOT NULL REFERENCES monitoring_projects(id) ON DELETE CASCADE, id uuid NOT NULL, started_at timestamptz NOT NULL, dimensions jsonb NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(project_id,id))`,
    );
    await q.query(
      `CREATE INDEX monitoring_page_views_project_time ON monitoring_page_views(project_id,started_at)`,
    );
    await q.query(
      `CREATE INDEX monitoring_page_views_received ON monitoring_page_views(received_at)`,
    );
    await q.query(
      `CREATE INDEX monitoring_page_views_trace_context ON monitoring_page_views(project_id,(dimensions->>'traceId'),(dimensions->>'spanId'),started_at,id)`,
    );
    await q.query(
      `CREATE TABLE monitoring_web_vitals (project_id uuid NOT NULL, page_view_id uuid NOT NULL, name varchar(4) NOT NULL, metric_id varchar(128) NOT NULL, revision bigint NOT NULL CHECK(revision > 0), value double precision NOT NULL CHECK(value >= 0), observed_at timestamptz NOT NULL, attribution jsonb NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(project_id,page_view_id,name), FOREIGN KEY(project_id,page_view_id) REFERENCES monitoring_page_views(project_id,id) ON DELETE CASCADE)`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE monitoring_web_vitals');
    await q.query('DROP TABLE monitoring_page_views');
  }
}

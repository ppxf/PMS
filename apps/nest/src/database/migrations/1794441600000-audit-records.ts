import { MigrationInterface, QueryRunner } from 'typeorm';
export class AuditRecords1794441600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE audit_records (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), created_at timestamptz NOT NULL DEFAULT now(),
      actor_id uuid NULL, actor_name varchar NOT NULL DEFAULT '', project_id uuid NULL,
      project_name text NULL, project_owner_id uuid NULL, group_id uuid NULL, group_name text NULL,
      object_type varchar NOT NULL DEFAULT '', object_id text NULL, object_name text NULL,
      action varchar NOT NULL, result varchar NOT NULL, status_code integer NOT NULL,
      request_id text NOT NULL, summary jsonb NOT NULL DEFAULT '{}'::jsonb
    )`);
    await queryRunner.query(
      'CREATE INDEX audit_records_project_created_idx ON audit_records(project_id, created_at)',
    );
    await queryRunner.query(
      'CREATE INDEX audit_records_owner_idx ON audit_records(project_owner_id)',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE audit_records');
  }
}

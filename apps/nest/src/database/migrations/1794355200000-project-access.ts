import { MigrationInterface, QueryRunner } from 'typeorm';
export class ProjectAccess1794355200000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE monitoring_projects ADD COLUMN owner_id uuid`);
    await q.query(
      `UPDATE monitoring_projects p SET owner_id = g.owner_id FROM groups g WHERE p.group_id = g.id`,
    );
    await q.query(
      `ALTER TABLE monitoring_projects ALTER COLUMN owner_id SET NOT NULL`,
    );
    await q.query(
      `ALTER TABLE monitoring_projects ADD CONSTRAINT fk_project_owner FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE`,
    );
    await q.query(
      `CREATE TABLE project_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES monitoring_projects(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, permissions jsonb NOT NULL DEFAULT '[]', invited_by uuid REFERENCES users(id) ON DELETE SET NULL, joined_at timestamptz NOT NULL DEFAULT now(), UNIQUE(project_id,user_id))`,
    );
    await q.query(
      `CREATE TABLE project_invitations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES monitoring_projects(id) ON DELETE CASCADE, email varchar NOT NULL, permissions text[] NOT NULL, invited_by uuid NOT NULL REFERENCES users(id), token_hash varchar(64) NOT NULL UNIQUE, expires_at timestamptz NOT NULL, accepted_at timestamptz, revoked_at timestamptz, delivery_status varchar NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE project_invitations`);
    await q.query(`DROP TABLE project_members`);
    await q.query(`ALTER TABLE monitoring_projects DROP COLUMN owner_id`);
  }
}

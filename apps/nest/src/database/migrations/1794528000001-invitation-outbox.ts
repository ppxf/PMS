import { MigrationInterface, QueryRunner } from 'typeorm';
export class InvitationOutbox1794528000001 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE invitation_outbox(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),invitation_id uuid NOT NULL CONSTRAINT invitation_outbox_invitation_fkey REFERENCES project_invitations(id) ON DELETE CASCADE,token_hash varchar(64) NOT NULL,payload text,status varchar(16) NOT NULL DEFAULT 'pending',attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,lease_token uuid,completed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now())`,
    );
    await q.query(
      'CREATE INDEX invitation_outbox_due ON invitation_outbox(status,next_attempt_at)',
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE invitation_outbox');
  }
}

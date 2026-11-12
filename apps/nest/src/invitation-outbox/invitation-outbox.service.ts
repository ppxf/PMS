import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { ProjectInvitation } from '../project-invitations/project-invitation.entity';
import { InvitationOutbox } from './invitation-outbox.entity';
import {
  decryptInvitationPayload,
  encryptInvitationPayload,
} from './invitation-outbox.crypto';
interface Payload {
  email: string;
  token: string;
  projectName: string;
  inviterName: string;
}

@Injectable()
export class InvitationOutboxService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopping = false;
  private readonly logger = new Logger(InvitationOutboxService.name);
  constructor(
    private readonly db: DataSource,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}
  onModuleInit() {
    const tick = () => {
      if (!this.stopping && this.db.isInitialized && !this.running)
        this.running = this.drain()
          .catch(() => this.logger.error('Invitation outbox processing failed'))
          .finally(() => {
            this.running = undefined;
          });
    };
    this.timer = setInterval(tick, 5000);
    this.timer.unref();
    tick();
  }
  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
  async enqueue(
    manager: EntityManager,
    invitation: ProjectInvitation,
    token: string,
    projectName: string,
    inviterName: string,
  ) {
    await this.cancel(manager, invitation.id);
    await manager.query(
      `UPDATE invitation_outbox o SET status='cancelled',payload=NULL,lease_token=NULL,lease_until=NULL,completed_at=now() FROM project_invitations i WHERE o.invitation_id=i.id AND i.project_id=$1 AND i.email=$2 AND i.revoked_at IS NOT NULL AND o.status IN ('pending','processing')`,
      [invitation.projectId, invitation.email],
    );
    const repository = manager.getRepository(InvitationOutbox);
    await repository.save(
      repository.create({
        invitationId: invitation.id,
        tokenHash: invitation.tokenHash,
        payload: encryptInvitationPayload(
          this.config.getOrThrow<string>('auth.jwtSecret'),
          { email: invitation.email, token, projectName, inviterName },
        ),
        status: 'pending',
        attempts: 0,
        nextAttemptAt: new Date(),
      }),
    );
  }
  async cancel(manager: EntityManager, invitationId: string) {
    await manager.query(
      `UPDATE invitation_outbox SET status='cancelled',payload=NULL,lease_token=NULL,lease_until=NULL,completed_at=now() WHERE invitation_id=$1 AND status IN ('pending','processing')`,
      [invitationId],
    );
  }
  async drain(limit = 20): Promise<void> {
    for (let i = 0; i < limit && !this.stopping; i++)
      if (!(await this.deliverOne())) return;
  }
  async deliverOne(): Promise<boolean> {
    const leaseToken = randomUUID();
    // Claim is one committed statement. SMTP never holds a database transaction or row lock.
    const [job] = await this.db.query<InvitationOutbox[]>(
      `WITH candidate AS (SELECT id FROM invitation_outbox WHERE (status='pending' AND next_attempt_at<=now()) OR (status='processing' AND lease_until<=now()) ORDER BY next_attempt_at,id LIMIT 1 FOR UPDATE SKIP LOCKED), claimed AS (UPDATE invitation_outbox o SET status='processing',attempts=o.attempts+1,lease_until=now()+interval '2 minutes',lease_token=$1 FROM candidate c WHERE o.id=c.id RETURNING o.id,o.invitation_id AS "invitationId",o.token_hash AS "tokenHash",o.payload,o.attempts) SELECT * FROM claimed`,
      [leaseToken],
    );
    if (!job) return false;
    const [valid] = await this.db.query(
      `SELECT i.id FROM project_invitations i JOIN invitation_outbox o ON o.invitation_id=i.id WHERE o.id=$1 AND o.lease_token=$2 AND i.token_hash=$3 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now()`,
      [job.id, leaseToken, job.tokenHash],
    );
    if (!valid || !job.payload) {
      await this.finish(job, leaseToken, 'cancelled');
      return true;
    }
    try {
      const payload = decryptInvitationPayload<Payload>(
        this.config.getOrThrow<string>('auth.jwtSecret'),
        job.payload,
      );
      await this.mail.sendProjectInvitation(
        payload.email,
        payload.token,
        payload.projectName,
        payload.inviterName,
      );
      await this.finish(job, leaseToken, 'sent');
    } catch {
      // Do not store transport errors: they can expose credentials or invitation tokens.
      await this.finish(job, leaseToken, 'failed');
    }
    return true;
  }
  private async finish(
    job: InvitationOutbox,
    leaseToken: string,
    outcome: 'sent' | 'failed' | 'cancelled',
  ) {
    await this.db.transaction(async (manager) => {
      // Match the management lock order (invitation then outbox) to avoid deadlocks with resend/revoke.
      const invitation = await manager
        .getRepository(ProjectInvitation)
        .findOne({
          where: { id: job.invitationId },
          select: {
            id: true,
            tokenHash: true,
            revokedAt: true,
            acceptedAt: true,
            expiresAt: true,
          },
          lock: { mode: 'pessimistic_write' },
        });
      const [owned] = await manager.query(
        `SELECT id FROM invitation_outbox WHERE id=$1 AND lease_token=$2 AND status='processing' FOR UPDATE`,
        [job.id, leaseToken],
      );
      if (!owned) return; // A recovered lease or cancelled task owns the result now.
      const current =
        invitation &&
        invitation.tokenHash === job.tokenHash &&
        !invitation.revokedAt &&
        !invitation.acceptedAt &&
        invitation.expiresAt > new Date();
      if (current && outcome !== 'cancelled')
        await manager
          .getRepository(ProjectInvitation)
          .update(invitation.id, { deliveryStatus: outcome });
      const retry = outcome === 'failed' && current && job.attempts < 8;
      await manager.query(
        `UPDATE invitation_outbox SET status=$3,payload=CASE WHEN $4 THEN payload ELSE NULL END,next_attempt_at=now()+($5 * interval '1 second'),lease_token=NULL,lease_until=NULL,completed_at=CASE WHEN $4 THEN NULL ELSE now() END WHERE id=$1 AND lease_token=$2`,
        [
          job.id,
          leaseToken,
          retry
            ? 'pending'
            : !current
              ? 'cancelled'
              : outcome === 'sent'
                ? 'completed'
                : 'failed',
          Boolean(retry),
          Math.min(3600, 30 * 2 ** (job.attempts - 1)),
        ],
      );
    });
  }
}

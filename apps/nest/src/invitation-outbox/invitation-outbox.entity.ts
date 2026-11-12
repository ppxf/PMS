import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { ProjectInvitation } from '../project-invitations/project-invitation.entity';

@Entity('invitation_outbox')
@Index('invitation_outbox_due', ['status', 'nextAttemptAt'])
export class InvitationOutbox {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'invitation_id', type: 'uuid' }) invitationId!: string;
  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash!: string;
  @Column({ type: 'text', nullable: true }) payload!: string | null;
  @Column({ type: 'varchar', length: 16, default: 'pending' }) status!: string;
  @Column({ type: 'integer', default: 0 }) attempts!: number;
  @Column({
    name: 'next_attempt_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  nextAttemptAt!: Date;
  @Column({ name: 'lease_until', type: 'timestamptz', nullable: true })
  leaseUntil!: Date | null;
  @Column({ name: 'lease_token', type: 'uuid', nullable: true }) leaseToken!:
    string | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
  @ManyToOne(() => ProjectInvitation, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'invitation_id',
    foreignKeyConstraintName: 'invitation_outbox_invitation_fkey',
  })
  invitation!: Relation<ProjectInvitation>;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  Unique,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { MonitoringProject } from '../monitoring-projects/entities/monitoring-project.entity';

@Entity('project_invitations')
@Unique('project_invitations_token_hash_key', ['tokenHash'])
export class ProjectInvitation {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'project_id', type: 'uuid' }) projectId!: string;
  @Column() email!: string;
  @Column({ type: 'text', array: true }) permissions!: string[];
  @Column({ name: 'invited_by', type: 'uuid' }) invitedBy!: string;
  @Column({ name: 'token_hash', length: 64, select: false })
  tokenHash!: string;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
  @Column({ name: 'delivery_status', default: 'pending' }) deliveryStatus!:
    'pending' | 'sent' | 'failed';
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
  @ManyToOne(() => MonitoringProject, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'project_id',
    foreignKeyConstraintName: 'project_invitations_project_id_fkey',
  })
  project!: Relation<MonitoringProject>;
  @ManyToOne(() => User, { onDelete: 'NO ACTION' })
  @JoinColumn({
    name: 'invited_by',
    foreignKeyConstraintName: 'project_invitations_invited_by_fkey',
  })
  inviter!: Relation<User>;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Group } from '../../groups/entities/group.entity';

export enum MonitoringPlatform {
  Vue = 'vue',
}

@Entity({ name: 'monitoring_projects' })
@Index(['groupId', 'slug'], { unique: true })
export class MonitoringProject {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'owner_id',
    foreignKeyConstraintName: 'fk_project_owner',
  })
  owner!: Relation<User>;

  @Column({ name: 'group_id', type: 'uuid' })
  groupId!: string;

  @ManyToOne(() => Group, (group) => group.projects, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group!: Group;

  @Column()
  name!: string;

  @Column()
  slug!: string;

  @Column({ type: 'enum', enum: MonitoringPlatform })
  platform!: MonitoringPlatform;

  @Column({ name: 'error_monitoring_enabled', default: true })
  errorMonitoringEnabled!: boolean;

  @Column({ name: 'logging_enabled', default: false })
  loggingEnabled!: boolean;

  @Column({ name: 'tracing_enabled', default: false })
  tracingEnabled!: boolean;

  @Column({
    name: 'propagation_targets',
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  propagationTargets!: string[];

  @Column({
    name: 'allowed_origins',
    type: 'jsonb',
    default: () => `'["*"]'::jsonb`,
  })
  allowedOrigins!: string[];

  @Column({
    name: 'reported_propagation_targets',
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  reportedPropagationTargets!: string[];

  @Column({ name: 'metrics_enabled', default: false })
  metricsEnabled!: boolean;

  @Column({ name: 'profiles_enabled', default: false })
  profilesEnabled!: boolean;

  @Column({ name: 'public_key', unique: true, length: 64 })
  publicKey!: string;

  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

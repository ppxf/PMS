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
import { Group } from '../../groups/entities/group.entity';

export enum MonitoringPlatform {
  Vue = 'vue',
}

@Entity({ name: 'monitoring_projects' })
@Index(['groupId', 'slug'], { unique: true })
export class MonitoringProject {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

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

  @Column({ name: 'metrics_enabled', default: false })
  metricsEnabled!: boolean;

  @Column({ name: 'public_key', unique: true, length: 64 })
  publicKey!: string;

  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

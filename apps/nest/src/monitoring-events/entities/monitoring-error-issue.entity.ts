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
import { MonitoringProject } from '../../monitoring-projects/entities/monitoring-project.entity';
import { MonitoringEvent } from './monitoring-event.entity';

export enum MonitoringErrorIssueStatus {
  Unresolved = 'unresolved',
}

@Entity({ name: 'monitoring_error_issues' })
@Index(
  'uq_monitoring_error_issues_project_fingerprint',
  ['projectId', 'fingerprint'],
  {
    unique: true,
  },
)
export class MonitoringErrorIssue {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @ManyToOne(() => MonitoringProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Relation<MonitoringProject>;

  @Column({ type: 'char', length: 64 })
  fingerprint!: string;

  @Column({ type: 'varchar', length: 2000 })
  title!: string;

  @Column({ name: 'exception_type', type: 'varchar', length: 128 })
  exceptionType!: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  culprit!: string | null;

  @Column({
    type: 'varchar',
    length: 16,
    default: MonitoringErrorIssueStatus.Unresolved,
  })
  status!: MonitoringErrorIssueStatus;

  @Column({ name: 'event_count', type: 'integer', default: 1 })
  eventCount!: number;

  @Column({ name: 'first_seen_at', type: 'timestamptz' })
  firstSeenAt!: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt!: Date;

  @Column({ name: 'latest_event_id', type: 'uuid', nullable: true })
  latestEventId!: string | null;

  @ManyToOne(() => MonitoringEvent, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'latest_event_id' })
  latestEvent!: Relation<MonitoringEvent> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { MonitoringProject } from '../../monitoring-projects/entities/monitoring-project.entity';
import { MonitoringErrorIssue } from './monitoring-error-issue.entity';

@Entity({ name: 'monitoring_events' })
export class MonitoringEvent {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @ManyToOne(() => MonitoringProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Relation<MonitoringProject>;

  @Column({ name: 'issue_id', type: 'uuid' })
  issueId!: string;

  @ManyToOne(() => MonitoringErrorIssue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issue_id' })
  issue!: Relation<MonitoringErrorIssue>;

  @Column({ type: 'timestamptz' })
  timestamp!: Date;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;

  @Column({ type: 'varchar', length: 32 })
  source!: string;

  @Column({ type: 'varchar', length: 16 })
  level!: string;

  @Column({ type: 'varchar', length: 2000 })
  message!: string;

  @Column({ name: 'exception_type', type: 'varchar', length: 128 })
  exceptionType!: string;

  @Column({ name: 'exception_value', type: 'varchar', length: 2000 })
  exceptionValue!: string;

  @Column({ type: 'text', nullable: true })
  stacktrace!: string | null;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  url!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  environment!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  release!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  tags!: Record<string, string>;
}

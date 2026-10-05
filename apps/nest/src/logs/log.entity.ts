import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { MonitoringProject } from '../monitoring-projects/entities/monitoring-project.entity';
@Entity({ name: 'monitoring_logs' })
@Index('monitoring_logs_project_time', ['projectId', 'timestamp'])
@Index('monitoring_logs_project_level_time', [
  'projectId',
  'level',
  'timestamp',
])
@Index('monitoring_logs_project_trace', ['projectId', 'traceId'])
@Index('monitoring_logs_received', ['receivedAt'])
export class LogEntity {
  @PrimaryColumn({ name: 'project_id', type: 'uuid' }) projectId!: string;
  @PrimaryColumn({ name: 'log_id', type: 'uuid' }) logId!: string;
  @ManyToOne(() => MonitoringProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Relation<MonitoringProject>;
  @Column({ type: 'timestamptz' }) timestamp!: Date;
  @Column({ type: 'varchar', length: 16 }) level!: string;
  @Column({ type: 'text' }) message!: string;
  @Column({ type: 'jsonb' }) attributes!: Record<
    string,
    string | number | boolean
  >;
  @Column({ type: 'varchar', length: 128, nullable: true }) environment!:
    string | null;
  @Column({ type: 'varchar', length: 128, nullable: true }) release!:
    string | null;
  @Column({ name: 'trace_id', type: 'varchar', length: 32, nullable: true })
  traceId!: string | null;
  @Column({ name: 'span_id', type: 'varchar', length: 16, nullable: true })
  spanId!: string | null;
  @Column({ name: 'content_hash', type: 'varchar', length: 64 })
  contentHash!: string;
  @Column({ name: 'received_at', type: 'timestamptz' }) receivedAt!: Date;
}
@Entity({ name: 'monitoring_log_batches' })
@Index('monitoring_log_batches_received', ['receivedAt'])
export class LogBatchEntity {
  @PrimaryColumn({ name: 'project_id', type: 'uuid' }) projectId!: string;
  @PrimaryColumn({ name: 'event_id', type: 'uuid' }) eventId!: string;
  @ManyToOne(() => MonitoringProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Relation<MonitoringProject>;
  @Column({ name: 'content_hash', type: 'varchar', length: 64 })
  contentHash!: string;
  @Column({ name: 'received_at', type: 'timestamptz' }) receivedAt!: Date;
}

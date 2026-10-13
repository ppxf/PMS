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

@Entity({ name: 'monitoring_metrics' })
@Index('monitoring_metrics_lookup', [
  'projectId',
  'name',
  'type',
  'unit',
  'timestamp',
])
@Index('monitoring_metrics_received', ['receivedAt'])
export class MetricEntity {
  @PrimaryColumn({ name: 'project_id', type: 'uuid' }) projectId!: string;
  @PrimaryColumn({ name: 'event_id', type: 'uuid' }) eventId!: string;
  @PrimaryColumn({ name: 'sample_index', type: 'integer' })
  sampleIndex!: number;
  @ManyToOne(() => MonitoringProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Relation<MonitoringProject>;
  @Column({ type: 'varchar', length: 128 }) name!: string;
  @Column({ type: 'varchar', length: 16 }) type!: string;
  @Column({ type: 'varchar', length: 32 }) unit!: string;
  @Column({ type: 'double precision' }) value!: number;
  @Column({ type: 'timestamptz' }) timestamp!: Date;
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
  @Column({ name: 'received_at', type: 'timestamptz' }) receivedAt!: Date;
}
@Entity({ name: 'monitoring_metric_batches' })
@Index('monitoring_metric_batches_received', ['receivedAt'])
export class MetricBatchEntity {
  @PrimaryColumn({ name: 'project_id', type: 'uuid' }) projectId!: string;
  @PrimaryColumn({ name: 'event_id', type: 'uuid' }) eventId!: string;
  @ManyToOne(() => MonitoringProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Relation<MonitoringProject>;
  @Column({ name: 'content_hash', type: 'varchar', length: 64 })
  contentHash!: string;
  @Column({ name: 'received_at', type: 'timestamptz' }) receivedAt!: Date;
}

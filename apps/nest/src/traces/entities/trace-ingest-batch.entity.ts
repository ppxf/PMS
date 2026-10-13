import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { MonitoringProject } from '../../monitoring-projects/entities/monitoring-project.entity';

@Entity({ name: 'monitoring_trace_ingest_batches' })
@Index('monitoring_trace_batches_received_at', ['receivedAt'])
export class TraceIngestBatch {
  @PrimaryColumn({ name: 'project_id', type: 'uuid' }) projectId!: string;
  @PrimaryColumn({ name: 'event_id', type: 'uuid' }) eventId!: string;
  @ManyToOne(() => MonitoringProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Relation<MonitoringProject>;
  @Column({ name: 'payload_hash', type: 'varchar', length: 64 })
  payloadHash!: string;
  @Column({ name: 'received_at', type: 'timestamptz' }) receivedAt!: Date;
}

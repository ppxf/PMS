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

@Entity({ name: 'monitoring_spans' })
@Index('monitoring_spans_project_time', ['projectId', 'startTime'])
@Index('monitoring_spans_received_at', ['receivedAt'])
export class MonitoringSpanEntity {
  @PrimaryColumn({ name: 'project_id', type: 'uuid' }) projectId!: string;
  @PrimaryColumn({ name: 'trace_id', type: 'varchar', length: 32 })
  traceId!: string;
  @PrimaryColumn({ name: 'span_id', type: 'varchar', length: 16 })
  spanId!: string;
  @ManyToOne(() => MonitoringProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Relation<MonitoringProject>;
  @Column({
    name: 'parent_span_id',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  parentSpanId!: string | null;
  @Column({ name: 'is_transaction', type: 'boolean' }) isTransaction!: boolean;
  @Column({ type: 'varchar', length: 64 }) op!: string;
  @Column({ type: 'varchar', length: 512 }) name!: string;
  @Column({ name: 'start_time', type: 'timestamptz' }) startTime!: Date;
  @Column({ name: 'end_time', type: 'timestamptz' }) endTime!: Date;
  @Column({ name: 'duration_ms', type: 'double precision' })
  durationMs!: number;
  @Column({ type: 'varchar', length: 32 }) status!: string;
  @Column({ type: 'varchar', length: 512, nullable: true }) environment!:
    string | null;
  @Column({ type: 'varchar', length: 512, nullable: true }) release!:
    string | null;
  @Column({ name: 'page_route', type: 'varchar', length: 512, nullable: true })
  pageRoute!: string | null;
  @Column({ name: 'http_method', type: 'varchar', length: 16, nullable: true })
  httpMethod!: string | null;
  @Column({ name: 'http_status_code', type: 'integer', nullable: true })
  httpStatusCode!: number | null;
  @Column({ name: 'http_route', type: 'varchar', length: 512, nullable: true })
  httpRoute!: string | null;
  @Column({ name: 'ttfb_ms', type: 'double precision', nullable: true })
  ttfbMs!: number | null;
  @Column({ name: 'transfer_size', type: 'double precision', nullable: true })
  transferSize!: number | null;
  @Column({
    name: 'encoded_body_size',
    type: 'double precision',
    nullable: true,
  })
  encodedBodySize!: number | null;
  @Column({
    name: 'decoded_body_size',
    type: 'double precision',
    nullable: true,
  })
  decodedBodySize!: number | null;
  @Column({ type: 'boolean' }) truncated!: boolean;
  @Column({ name: 'end_reason', type: 'varchar', length: 64 })
  endReason!: string;
  @Column({ name: 'dropped_span_count', type: 'integer' })
  droppedSpanCount!: number;
  @Column({ type: 'jsonb' }) attributes!: Record<
    string,
    string | number | boolean
  >;
  @Column({ name: 'content_hash', type: 'varchar', length: 64 })
  contentHash!: string;
  @Column({ name: 'received_at', type: 'timestamptz' }) receivedAt!: Date;
}

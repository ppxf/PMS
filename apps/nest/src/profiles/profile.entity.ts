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
import type { MonitoringProfile } from './profiles-contract';

@Entity({ name: 'monitoring_profiles' })
@Index('monitoring_profiles_project_time', [
  'projectId',
  'startedAt',
  'profileId',
])
@Index('monitoring_profiles_project_environment_time', [
  'projectId',
  'environment',
  'startedAt',
])
@Index('monitoring_profiles_project_trace', ['projectId', 'traceId'])
export class ProfileEntity {
  @PrimaryColumn({ name: 'project_id', type: 'uuid' }) projectId!: string;
  @PrimaryColumn({ name: 'profile_id', type: 'uuid' }) profileId!: string;
  @ManyToOne(() => MonitoringProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Relation<MonitoringProject>;
  @Column({ name: 'started_at', type: 'timestamptz' }) startedAt!: Date;
  @Column({ name: 'duration_ms', type: 'double precision' })
  durationMs!: number;
  @Column({ name: 'sample_interval_ms', type: 'double precision' })
  sampleIntervalMs!: number;
  @Column({ type: 'varchar', length: 512 }) name!: string;
  @Column({ type: 'varchar', length: 128, nullable: true }) environment!:
    string | null;
  @Column({ type: 'varchar', length: 128, nullable: true }) release!:
    string | null;
  @Column({ name: 'trace_id', type: 'varchar', length: 32, nullable: true })
  traceId!: string | null;
  @Column({ name: 'span_id', type: 'varchar', length: 16, nullable: true })
  spanId!: string | null;
  @Column({ type: 'boolean' }) truncated!: boolean;
  @Column({ name: 'sample_count', type: 'integer' }) sampleCount!: number;
  @Column({ type: 'jsonb' }) profile!: MonitoringProfile;
  @Column({ name: 'content_hash', type: 'varchar', length: 64 })
  contentHash!: string;
  @Column({ name: 'received_at', type: 'timestamptz' }) receivedAt!: Date;
}

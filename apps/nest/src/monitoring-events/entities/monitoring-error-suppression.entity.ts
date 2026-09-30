import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { MonitoringProject } from '../../monitoring-projects/entities/monitoring-project.entity';

@Entity({ name: 'monitoring_error_suppressions' })
@Index(
  'uq_monitoring_error_suppressions_scope',
  ['projectId', 'environment', 'fingerprint'],
  { unique: true },
)
export class MonitoringErrorSuppression {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @ManyToOne(() => MonitoringProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Relation<MonitoringProject>;

  @Column({ type: 'varchar', length: 64 })
  environment!: string;

  @Column({ type: 'char', length: 64 })
  fingerprint!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

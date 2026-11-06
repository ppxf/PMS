import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  Check,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { MonitoringProject } from '../monitoring-projects/entities/monitoring-project.entity';
@Entity('monitoring_page_views')
@Index('monitoring_page_views_trace_context', { synchronize: false })
@Index('monitoring_page_views_project_time', ['projectId', 'startedAt'])
@Index('monitoring_page_views_received', ['receivedAt'])
export class MonitoringPageView {
  @PrimaryColumn({ name: 'project_id', type: 'uuid' }) projectId!: string;
  @PrimaryColumn({ type: 'uuid' }) id!: string;
  @ManyToOne(() => MonitoringProject, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'project_id',
    foreignKeyConstraintName: 'monitoring_page_views_project_id_fkey',
  })
  project!: Relation<MonitoringProject>;
  @Column({ name: 'started_at', type: 'timestamptz' }) startedAt!: Date;
  @Column({ type: 'jsonb' }) dimensions!: Record<string, string>;
  @Column({ name: 'received_at', type: 'timestamptz', default: () => 'now()' })
  receivedAt!: Date;
}
@Entity('monitoring_web_vitals')
@Check('monitoring_web_vitals_revision_check', 'revision > 0')
@Check('monitoring_web_vitals_value_check', 'value >= 0')
export class MonitoringWebVital {
  @PrimaryColumn({ name: 'project_id', type: 'uuid' }) projectId!: string;
  @PrimaryColumn({ name: 'page_view_id', type: 'uuid' }) pageViewId!: string;
  @PrimaryColumn({ type: 'varchar', length: 4 }) name!: string;
  @ManyToOne(() => MonitoringPageView, { onDelete: 'CASCADE' })
  @JoinColumn([
    {
      name: 'project_id',
      referencedColumnName: 'projectId',
      foreignKeyConstraintName:
        'monitoring_web_vitals_project_id_page_view_id_fkey',
    },
    {
      name: 'page_view_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName:
        'monitoring_web_vitals_project_id_page_view_id_fkey',
    },
  ])
  page!: Relation<MonitoringPageView>;
  @Column({ name: 'metric_id', type: 'varchar', length: 128 })
  metricId!: string;
  @Column({ type: 'bigint' }) revision!: string;
  @Column({ type: 'double precision' }) value!: number;
  @Column({ name: 'observed_at', type: 'timestamptz' }) observedAt!: Date;
  @Column({ type: 'jsonb' }) attribution!: Record<
    string,
    string | number | boolean
  >;
  @Column({ name: 'received_at', type: 'timestamptz', default: () => 'now()' })
  receivedAt!: Date;
}

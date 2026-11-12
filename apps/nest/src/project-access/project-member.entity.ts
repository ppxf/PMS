import {
  Column,
  CreateDateColumn,
  Entity,
  Unique,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { MonitoringProject } from '../monitoring-projects/entities/monitoring-project.entity';
@Entity({ name: 'project_members' })
@Unique('project_members_project_id_user_id_key', ['projectId', 'userId'])
export class ProjectMember {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'project_id', type: 'uuid' }) projectId!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  permissions!: string[];
  @Column({ name: 'invited_by', type: 'uuid', nullable: true }) invitedBy!:
    string | null;
  @CreateDateColumn({ name: 'joined_at', type: 'timestamptz' }) joinedAt!: Date;
  @ManyToOne(() => MonitoringProject, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'project_id',
    foreignKeyConstraintName: 'project_members_project_id_fkey',
  })
  project!: Relation<MonitoringProject>;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'project_members_user_id_fkey',
  })
  user!: Relation<User>;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'invited_by',
    foreignKeyConstraintName: 'project_members_invited_by_fkey',
  })
  inviter!: Relation<User> | null;
}

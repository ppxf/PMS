import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'audit_records' })
@Index('audit_records_project_created_idx', ['projectId', 'createdAt'])
@Index('audit_records_owner_idx', ['projectOwnerId'])
export class AuditRecord {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
  @Column({ name: 'actor_id', type: 'uuid', nullable: true }) actorId!:
    string | null;
  @Column({ name: 'actor_name', default: '' }) actorName!: string;
  @Column({ name: 'project_id', type: 'uuid', nullable: true }) projectId!:
    string | null;
  @Column({ name: 'project_name', nullable: true, type: 'text' }) projectName!:
    string | null;
  @Column({ name: 'project_owner_id', type: 'uuid', nullable: true })
  projectOwnerId!: string | null;
  @Column({ name: 'group_id', type: 'uuid', nullable: true }) groupId!:
    string | null;
  @Column({ name: 'group_name', nullable: true, type: 'text' }) groupName!:
    string | null;
  @Column({ name: 'object_type', default: '' }) objectType!: string;
  @Column({ name: 'object_id', type: 'text', nullable: true }) objectId!:
    string | null;
  @Column({ name: 'object_name', type: 'text', nullable: true }) objectName!:
    string | null;
  @Column() action!: string;
  @Column() result!: 'success' | 'failure';
  @Column({ name: 'status_code', type: 'integer' }) statusCode!: number;
  @Column({ name: 'request_id', type: 'text' }) requestId!: string;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) summary!: Record<
    string,
    unknown
  >;
}

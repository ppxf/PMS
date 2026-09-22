import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Group } from '../../groups/entities/group.entity';

export enum UserStatus {
  PendingVerification = 'pending_verification',
  Active = 'active',
  Disabled = 'disabled',
}

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ name: 'password_hash', select: false })
  passwordHash!: string;

  @Column()
  name!: string;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.PendingVerification,
  })
  status!: UserStatus;

  @Column({ type: 'text', array: true, default: '{}' })
  permissions!: string[];

  @OneToMany(() => Group, (group) => group.owner)
  groups!: Group[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';
import { Group } from '@/modules/groups/entities/group.entity';

@Entity('activities')
export class Activity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 80 })
  type!: string;

  @Column({ type: 'varchar', length: 40 })
  action!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  amount?: number;

  @Column({ type: 'varchar', length: 10, nullable: true })
  currency?: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  status?: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  resourceType?: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  resourceId?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @Column({ type: 'uuid', nullable: true })
  actorId?: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true, eager: false })
  @JoinColumn({ name: 'actorId' })
  actor?: User;

  @Column({ type: 'varchar', length: 50, nullable: true })
  actorRole?: string;

  @Column({ type: 'uuid', nullable: true })
  actorGroupId?: string;

  @Column({ type: 'uuid', nullable: true })
  groupId?: string;

  @ManyToOne(() => Group, { onDelete: 'SET NULL', nullable: true, eager: false })
  @JoinColumn({ name: 'groupId' })
  group?: Group;

  @Column({ type: 'varchar', length: 10 })
  method!: string;

  @Column({ type: 'varchar', length: 255 })
  path!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipAddress?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent?: string;

  @CreateDateColumn()
  createdAt!: Date;
}

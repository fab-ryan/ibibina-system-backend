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

export enum ReportType {
  MEETING = 'meeting',
  AUDIT = 'audit',
  MONTHLY = 'monthly',
  LOANS = 'loans',
}

@Entity('reports')
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  groupId!: string;

  @ManyToOne(() => Group, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'groupId' })
  group!: Group;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'enum', enum: ReportType })
  type!: ReportType;

  /** Period the report covers: '2026-05', '2026-Q1', '2026-05-01', '2026' */
  @Column({ type: 'varchar', length: 20 })
  period!: string;

  /** Size of the Excel file in bytes */
  @Column({ type: 'int', default: 0 })
  sizeBytes!: number;

  /** URL of the generated Excel (.xlsx) file */
  @Column({ type: 'varchar', length: 512 })
  fileUrl!: string;

  @Column({ type: 'uuid', nullable: true })
  generatedById?: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true, eager: true })
  @JoinColumn({ name: 'generatedById' })
  generatedBy?: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

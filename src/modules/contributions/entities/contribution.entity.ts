import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';
import { Group } from '@/modules/groups/entities/group.entity';
import type { Penalty } from '@/modules/penalties/entities/penalty.entity';

export enum ContributionStatus {
  PENDING = 'pending',
  PAID = 'paid',
  LATE = 'late',
  MISSED = 'missed',
  WAIVED = 'waived',
}

export interface ContributionSettingsSnapshot {
  contributionAmount?: number;
  contributionCurrency?: string;
  contributionFrequency?: 'weekly' | 'monthly';
  gracePeriodDays?: number;
  meetingDay?: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
}

@Entity('contributions')
export class Contribution {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // ─── Who & which group ──────────────────────────────────────────────────────

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'uuid' })
  groupId!: string;

  @ManyToOne(() => Group, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'groupId' })
  group!: Group;

  // ─── Cycle / period ─────────────────────────────────────────────────────────
  // Format: "2026-W18" for weekly, "2026-05" for monthly

  @Column({ type: 'varchar', length: 20 })
  period!: string;

  @Column({ type: 'date' })
  dueDate!: string;

  // ─── Amount ─────────────────────────────────────────────────────────────────

  // ─── Expected vs actual amount ───────────────────────────────────────────

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount!: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  paidAmount?: number;

  @Column({ type: 'varchar', length: 10, default: 'RWF' })
  currency!: string;

  @Column({ type: 'jsonb', nullable: true })
  settingsSnapshot?: ContributionSettingsSnapshot;

  // ─── Cycle tracking ──────────────────────────────────────────────────────

  @Column({ type: 'int', nullable: true })
  cycleNumber?: number;

  // ─── Status ──────────────────────────────────────────────────────────────

  @Column({ type: 'enum', enum: ContributionStatus, default: ContributionStatus.PENDING })
  status!: ContributionStatus;

  // ─── Waiver details ──────────────────────────────────────────────────────

  @Column({ type: 'timestamptz', nullable: true })
  waivedAt?: Date;

  @Column({ type: 'uuid', nullable: true })
  waivedById?: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true, eager: false })
  @JoinColumn({ name: 'waivedById' })
  waivedBy?: User;

  @Column({ type: 'text', nullable: true })
  waivedReason?: string;

  // ─── Penalties (separate table) ─────────────────────────────────────────────

  @OneToMany('Penalty', (p: Penalty) => p.contribution, { eager: false })
  penalties!: Penalty[];

  // ─── Recorded by ────────────────────────────────────────────────────────────

  @Column({ type: 'uuid', nullable: true })
  recordedById?: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true, eager: false })
  @JoinColumn({ name: 'recordedById' })
  recordedBy?: User;

  // ─── Misc ────────────────────────────────────────────────────────────────────

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

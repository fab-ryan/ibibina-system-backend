import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';
import { Group } from '@/modules/groups/entities/group.entity';
import { Contribution } from '@/modules/contributions/entities/contribution.entity';
import { PaymentMethod } from '@/enums';

export enum PenaltyStatus {
  PENDING = 'pending',
  PAID = 'paid',
  WAIVED = 'waived',
}

export enum PenaltyReason {
  LATE_PAYMENT = 'late_payment',
  MISSED_PAYMENT = 'missed_payment',
  MISSED_MEETING = 'missed_meeting',
  RULE_VIOLATION = 'rule_violation',
  OTHER = 'other',
}

@Entity('penalties')
export class Penalty {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // ─── Context ─────────────────────────────────────────────────────────────────

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'uuid' })
  groupId!: string;

  @ManyToOne(() => Group, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'groupId' })
  group!: Group;

  @Column({ type: 'uuid', nullable: true })
  contributionId?: string;

  @ManyToOne(() => Contribution, (c) => c.penalties, {
    onDelete: 'SET NULL',
    nullable: true,
    eager: false,
  })
  @JoinColumn({ name: 'contributionId' })
  contribution?: Contribution;

  // ─── Penalty details ─────────────────────────────────────────────────────────

  @Column({ type: 'enum', enum: PenaltyReason, default: PenaltyReason.LATE_PAYMENT })
  reason!: PenaltyReason;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount!: number;

  @Column({ type: 'varchar', length: 10, default: 'RWF' })
  currency!: string;

  // ─── Status & settlement ─────────────────────────────────────────────────────

  @Column({ type: 'enum', enum: PenaltyStatus, default: PenaltyStatus.PENDING })
  status!: PenaltyStatus;

  @Column({ type: 'enum', enum: PaymentMethod, nullable: true })
  paymentMethod?: PaymentMethod;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt?: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  momoRef?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  bankRef?: string;

  // ─── Issued by ───────────────────────────────────────────────────────────────

  @Column({ type: 'uuid', nullable: true })
  issuedById?: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true, eager: false })
  @JoinColumn({ name: 'issuedById' })
  issuedBy?: User;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

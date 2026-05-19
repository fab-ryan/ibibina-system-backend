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
import { Loan } from './loan.entity';
import { PaymentMethod } from '@/enums';

export enum RepaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  PARTIAL = 'partial',
  MISSED = 'missed',
}

@Entity('loan_repayments')
export class LoanRepayment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // ─── Loan reference ───────────────────────────────────────────────────────

  @Column({ type: 'uuid' })
  loanId!: string;

  @ManyToOne(() => Loan, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'loanId' })
  loan!: Loan;

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

  // ─── Installment details ──────────────────────────────────────────────────

  /** Sequential installment number (1 = first, 2 = second …) */
  @Column({ type: 'int' })
  installmentNumber!: number;

  /** Expected amount for this installment */
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amountDue!: number;

  /** Actual amount paid (may be partial) */
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  amountPaid?: number;

  @Column({ type: 'varchar', length: 10, default: 'RWF' })
  currency!: string;

  @Column({ type: 'date' })
  dueDate!: string;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt?: Date;

  // ─── Status ───────────────────────────────────────────────────────────────

  @Column({ type: 'enum', enum: RepaymentStatus, default: RepaymentStatus.PENDING })
  status!: RepaymentStatus;

  // ─── Payment details ──────────────────────────────────────────────────────

  @Column({ type: 'enum', enum: PaymentMethod, nullable: true })
  paymentMethod?: PaymentMethod;

  @Column({ type: 'varchar', length: 100, nullable: true })
  momoRef?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  bankRef?: string;

  // ─── Audit ────────────────────────────────────────────────────────────────

  @Column({ type: 'uuid', nullable: true })
  recordedById?: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true, eager: false })
  @JoinColumn({ name: 'recordedById' })
  recordedBy?: User;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}

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
import { LoanRepayment } from './loan-repayment.entity';
// import { LoanRepayment } from './loan-repayment.entity';

export enum LoanStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  ACTIVE = 'active',
  CLOSED = 'closed',
  DEFAULTED = 'defaulted',
}

export interface LoanSettingsSnapshot {
  interestRate: number;
  maxDurationMonths: number;
  collateralRequired: boolean;
  maxLoanMultiplier: number;
  contributionFrequency: 'weekly' | 'monthly';
}

@Entity('loans')
export class Loan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // ─── Who & which group ────────────────────────────────────────────────────

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

  // ─── Loan amount ──────────────────────────────────────────────────────────

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  requestedAmount!: number;

  /** Actual amount disbursed (may differ from requested if partially approved) */
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  disbursedAmount?: number;

  @Column({ type: 'varchar', length: 10, default: 'RWF' })
  currency!: string;

  // ─── Interest & term ─────────────────────────────────────────────────────

  /** Monthly interest rate snapshot at the time of approval */
  @Column({ type: 'numeric', precision: 6, scale: 4, nullable: true })
  interestRate?: number;

  /** Requested term in months */
  @Column({ type: 'int' })
  termMonths!: number;

  /** Total repayment amount = principal + interest */
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  totalDue?: number;

  /** Amount of each installment */
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  installmentAmount?: number;

  /** Total number of installments (weekly or monthly) */
  @Column({ type: 'int', nullable: true })
  totalInstallments?: number;

  /** Remaining balance to be repaid */
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  remainingBalance?: number;

  // ─── Status ───────────────────────────────────────────────────────────────

  @Column({ type: 'enum', enum: LoanStatus, default: LoanStatus.PENDING })
  status!: LoanStatus;

  // ─── Purpose ─────────────────────────────────────────────────────────────

  @Column({ type: 'text' })
  purpose!: string;

  @Column({ type: 'text', nullable: true })
  collateralDescription?: string;

  // ─── Approval / rejection ─────────────────────────────────────────────────

  @Column({ type: 'uuid', nullable: true })
  approvedById?: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true, eager: false })
  @JoinColumn({ name: 'approvedById' })
  approvedBy?: User;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt?: Date;

  @Column({ type: 'text', nullable: true })
  approvalNotes?: string;

  @Column({ type: 'uuid', nullable: true })
  rejectedById?: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true, eager: false })
  @JoinColumn({ name: 'rejectedById' })
  rejectedBy?: User;

  @Column({ type: 'timestamptz', nullable: true })
  rejectedAt?: Date;

  @Column({ type: 'text', nullable: true })
  rejectionReason?: string;

  // ─── Disbursement ─────────────────────────────────────────────────────────

  @Column({ type: 'uuid', nullable: true })
  disbursedById?: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true, eager: false })
  @JoinColumn({ name: 'disbursedById' })
  disbursedBy?: User;

  @Column({ type: 'timestamptz', nullable: true })
  disbursedAt?: Date;

  /** Date of the first repayment installment */
  @Column({ type: 'date', nullable: true })
  firstRepaymentDate?: string;

  // ─── Closure ─────────────────────────────────────────────────────────────

  @Column({ type: 'timestamptz', nullable: true })
  closedAt?: Date;

  // ─── Snapshot of group settings at time of approval ──────────────────────

  @Column({ type: 'jsonb', nullable: true })
  settingsSnapshot?: LoanSettingsSnapshot;

  // ─── Repayments ───────────────────────────────────────────────────────────

  @OneToMany(() => LoanRepayment, (r: LoanRepayment) => r.loan, { eager: false })
  repayments!: LoanRepayment[];

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}

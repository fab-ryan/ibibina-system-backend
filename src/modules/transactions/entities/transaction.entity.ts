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
import { PaymentMethod } from '@/enums';

export enum TransactionType {
  CONTRIBUTION = 'contribution',
  PENALTY = 'penalty',
  LOAN_DISBURSEMENT = 'loan_disbursement',
  LOAN_REPAYMENT = 'loan_repayment',
}

export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // ─── What this payment is for ────────────────────────────────────────────────

  @Column({ type: 'enum', enum: TransactionType })
  type!: TransactionType;

  /** UUID of the Contribution or Penalty this transaction settles */
  @Column({ type: 'uuid' })
  referenceId!: string;

  // ─── Who & which group ───────────────────────────────────────────────────────

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

  // ─── Amount ──────────────────────────────────────────────────────────────────

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount!: number;

  @Column({ type: 'varchar', length: 10, default: 'RWF' })
  currency!: string;

  // ─── Payment details ─────────────────────────────────────────────────────────

  @Column({ type: 'enum', enum: PaymentMethod })
  paymentMethod!: PaymentMethod;

  @Column({ type: 'enum', enum: TransactionStatus, default: TransactionStatus.COMPLETED })
  status!: TransactionStatus;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  paidAt!: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  momoRef?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  bankRef?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  referenceFileUrl?: string;

  // ─── Audit ───────────────────────────────────────────────────────────────────

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

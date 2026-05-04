import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';

export enum GroupPurpose {
  SAVINGS = 'savings',
  NETGROWTH = 'netgrowth',
  INVESTMENT = 'investment',
  SOCIAL_SUPPORT = 'social-support',
  AGRICULTURE = 'agriculture',
  OTHER = 'other',
}

export interface GroupSettings {
  contributionAmount: number;
  contributionCurrency: string;
  contributionFrequency: 'weekly' | 'monthly';
  meetingDay: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  allowLoans: boolean;
  maxLoanMultiplier: number;
  gracePeriodDays: number;
  penaltyRate?: number;
  memberLimit?: number;
  additional?: Record<string, string | number | boolean>;
}

export const DEFAULT_GROUP_SETTINGS: GroupSettings = {
  contributionAmount: 1000,
  contributionCurrency: 'RWF',
  contributionFrequency: 'weekly',
  meetingDay: 'saturday',
  allowLoans: true,
  maxLoanMultiplier: 3,
  gracePeriodDays: 7,
  penaltyRate: 0.05, // 5% penalty for late payments
  memberLimit: 50, // Default max members per group
  additional: {},
};

@Entity('groups')
export class Group {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120, unique: true })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true, unique: true })
  groupe_code?: string;

  @Column({
    type: 'enum',
    enum: GroupPurpose,
    default: GroupPurpose.SAVINGS,
  })
  purpose!: GroupPurpose;

  @Column({ type: 'date', nullable: true })
  startDate?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  province?: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  district?: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  sector?: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  cell?: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  village?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  meetingLocation?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  contactPhone?: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  foundedBy?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, unique: true })
  registrationNumber?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  settings!: GroupSettings;

  @OneToMany(() => User, (user) => user.group)
  users!: User[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

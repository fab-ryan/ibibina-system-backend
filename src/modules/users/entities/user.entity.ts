import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import * as bcrypt from 'bcrypt';
import { UserRole, UserStatus } from '../enums/user-role.enum';

/** Roles that authenticate with password + email */
export const ADMIN_ROLES: UserRole[] = [UserRole.ADMIN];

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 100, nullable: true })
  firstName?: string;

  @Column({ length: 100, nullable: true })
  lastName?: string;

  /** Required for ADMIN role only */
  @Column({ unique: true, nullable: true, length: 255 })
  email?: string;

  /** Required for non-ADMIN roles; Rwandan phone number */
  @Column({ unique: true, nullable: true, length: 20 })
  phone?: string;

  /** Stores hashed password (admin) or hashed 6-digit PIN (non-admin) */
  @Exclude()
  @Column({ nullable: true })
  password?: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.MEMBER })
  role!: UserRole;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status!: UserStatus;

  /**
   * Email verification flag for ADMIN role.
   * Checked once during the login flow — the issued JWT carries access rights
   * so this is NOT re-evaluated on every request.
   */
  @Column({ default: false })
  isEmailVerified!: boolean;

  @Column({ nullable: true, length: 500 })
  profilePicture?: string;

  /** Hashed refresh token — cleared on logout, rotated on every refresh */
  @Exclude()
  @Column({ nullable: true, type: 'text' })
  refreshToken?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @BeforeInsert()
  @BeforeUpdate()
  async hashCredentials() {
    if (this.password && !this.password.startsWith('$2b$')) {
      this.password = await bcrypt.hash(this.password, 12);
    }
  }

  async comparePassword(plain: string): Promise<boolean> {
    if (!this.password) return false;
    return bcrypt.compare(plain, this.password);
  }

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  get isAdmin(): boolean {
    return ADMIN_ROLES.includes(this.role);
  }
}

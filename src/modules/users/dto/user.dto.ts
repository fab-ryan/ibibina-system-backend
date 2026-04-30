import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { UserRole, UserStatus } from '../enums/user-role.enum';
import { ADMIN_ROLES } from '../entities/user.entity';

/**
 * Rwandan phone number — accepts:
 *  +2507XXXXXXXX  (international with +)
 *   2507XXXXXXXX  (international without +)
 *    07XXXXXXXX   (local format)
 */
export const RWANDAN_PHONE_REGEX = /^(\+?250|0)(7[2-9]\d{7})$/;
export const RWANDAN_PHONE_MESSAGE =
  'Phone number must be a valid Rwandan number (e.g. +250788123456 or 0788123456)';

export class CreateUserDto {
  @ApiProperty({ example: 'Jean' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Mutabazi' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  lastName!: string;

  @ApiPropertyOptional({
    enum: UserRole,
    default: UserRole.MEMBER,
    description:
      'Defaults to member. Admin role requires email + password; others require phone + PIN.',
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  // ─── Admin-only fields ─────────────────────────────────────────────────────

  @ApiPropertyOptional({
    example: 'jean.mutabazi@example.com',
    description: 'Required for admin role',
  })
  @ValidateIf((o: { role?: UserRole }) => ADMIN_ROLES.includes(o.role ?? UserRole.MEMBER))
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    example: 'P@ssw0rd!',
    description: 'Required for admin role (min 8 chars, mixed case + number + symbol)',
  })
  @ValidateIf((o: { role?: UserRole }) => ADMIN_ROLES.includes(o.role ?? UserRole.MEMBER))
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).+$/, {
    message: 'Password must contain uppercase, lowercase, number and special character',
  })
  password?: string;

  // ─── Non-admin fields ──────────────────────────────────────────────────────

  @ApiPropertyOptional({
    example: '+250788123456',
    description: 'Required for non-admin roles; must be a valid Rwandan number',
  })
  @ValidateIf((o: { role?: UserRole }) => !ADMIN_ROLES.includes(o.role ?? UserRole.MEMBER))
  @IsNotEmpty()
  @IsString()
  @Matches(RWANDAN_PHONE_REGEX, { message: RWANDAN_PHONE_MESSAGE })
  phone?: string;

  @ApiPropertyOptional({
    example: '123456',
    description: 'Required for non-admin roles; exactly 6 digits — stored as credential',
  })
  @ValidateIf((o: { role?: UserRole }) => !ADMIN_ROLES.includes(o.role ?? UserRole.MEMBER))
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'PIN must be exactly 6 digits' })
  pin?: string;

  @IsOptional()
  @ApiPropertyOptional({ enum: UserStatus, default: UserStatus.ACTIVE })
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password', 'pin'] as const),
) {
  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current password (admin only)' })
  @IsNotEmpty()
  @IsString()
  currentPassword!: string;

  @ApiProperty({ minLength: 8 })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).+$/, {
    message: 'Password must contain uppercase, lowercase, number and special character',
  })
  newPassword!: string;
}

export class ChangePinDto {
  @ApiProperty({ description: 'Current 6-digit PIN', example: '123456' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'PIN must be exactly 6 digits' })
  currentPin!: string;

  @ApiProperty({ description: 'New 6-digit PIN', example: '654321' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'PIN must be exactly 6 digits' })
  newPin!: string;
}

export class LoginDto {
  @ApiProperty({
    example: '+250788123456 or jean@example.com',
    description: 'Email address (admin) or Rwandan phone number (other roles)',
  })
  @IsNotEmpty()
  @IsString()
  identifier!: string;

  @ApiProperty({
    example: 'P@ssw0rd! or 123456',
    description: 'Password for admin role, 6-digit PIN for other roles',
  })
  @IsNotEmpty()
  @IsString()
  credential!: string;
}

export class UserFilterDto {
  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ example: 'Jean' })
  @IsOptional()
  @IsString()
  search?: string;
}

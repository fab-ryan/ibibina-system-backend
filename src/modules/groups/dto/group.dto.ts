import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '@/modules/users/enums/user-role.enum';
import { GroupPurpose } from '../entities/group.entity';

export class GroupSettingsDto {
  @ApiProperty({ example: 1000 })
  @IsInt()
  @Min(1)
  contributionAmount!: number;

  @ApiProperty({ example: 'RWF' })
  @IsString()
  @MaxLength(10)
  contributionCurrency!: string;

  @ApiProperty({ enum: ['weekly', 'monthly'], example: 'weekly' })
  @IsIn(['weekly', 'monthly'])
  contributionFrequency!: 'weekly' | 'monthly';

  @ApiProperty({
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    example: 'saturday',
  })
  @IsIn(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
  meetingDay!: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

  @ApiProperty({ example: true })
  @IsBoolean()
  allowLoans!: boolean;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  @Max(20)
  maxLoanMultiplier!: number;

  @ApiProperty({ example: 7 })
  @IsInt()
  @Min(0)
  @Max(180)
  gracePeriodDays!: number;

  @ApiPropertyOptional({
    description: 'Flexible settings map for group-specific configuration',
    example: { requireAttendanceBeforeLoan: true, registrationFee: 5000 },
  })
  @IsOptional()
  @IsObject()
  additional?: Record<string, string | number | boolean>;
}

export class CreateGroupDto {
  @ApiProperty({ example: 'Ibibina Nyamirambo' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    enum: GroupPurpose,
    default: GroupPurpose.SAVINGS,
    example: GroupPurpose.NETGROWTH,
  })
  @IsOptional()
  @IsEnum(GroupPurpose)
  purpose?: GroupPurpose;

  @ApiPropertyOptional({
    example: '2026-01-15',
    description: 'Date when the group started',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: 'Savings group for Nyamirambo sector members' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 'Kigali' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  province?: string;

  @ApiPropertyOptional({ example: 'Nyarugenge' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string;

  @ApiPropertyOptional({ example: 'Nyamirambo' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sector?: string;

  @ApiPropertyOptional({ example: 'Rugarama' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  cell?: string;

  @ApiPropertyOptional({ example: 'Amahoro Village' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  village?: string;

  @ApiPropertyOptional({ example: 'Nyamirambo community hall' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  meetingLocation?: string;

  @ApiPropertyOptional({ example: '+250788123456' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  contactPhone?: string;

  @ApiPropertyOptional({ example: 'Jean Uwimana' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  foundedBy?: string;

  @ApiPropertyOptional({ example: 'IBB-2026-001' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  registrationNumber?: string;

  @ApiPropertyOptional({ example: 'Main group focused on savings and small investment growth.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: GroupSettingsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => GroupSettingsDto)
  settings?: GroupSettingsDto;
}

export class UpdateGroupDto extends PartialType(CreateGroupDto) {}

export class UpdateGroupSettingsDto {
  @ApiProperty({ type: GroupSettingsDto })
  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => GroupSettingsDto)
  settings!: GroupSettingsDto;
}

export class GroupFilterDto {
  @ApiPropertyOptional({ example: 'nyamirambo' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AssignChairpersonDto {
  @ApiProperty({ description: 'User UUID to become the group chairperson' })
  @IsNotEmpty()
  @IsUUID()
  userId!: string;
}

export class AssignGroupRoleDto {
  @ApiProperty({ description: 'User UUID to assign into the group' })
  @IsNotEmpty()
  @IsUUID()
  userId!: string;

  @ApiProperty({
    enum: [UserRole.CHAIRPERSON, UserRole.SECRETARY, UserRole.FINANCE, UserRole.MEMBER],
    example: UserRole.FINANCE,
  })
  @IsNotEmpty()
  @IsEnum(UserRole)
  role!: UserRole;
}

// ─── Bulk: many users → same role ────────────────────────────────────────────

export class BulkAssignGroupRoleDto {
  @ApiProperty({
    description: 'Array of user UUIDs to assign to the same role (min 1)',
    type: [String],
    example: ['uuid-1', 'uuid-2'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  userIds!: string[];

  @ApiProperty({
    enum: [UserRole.CHAIRPERSON, UserRole.SECRETARY, UserRole.FINANCE, UserRole.MEMBER],
    description: 'Role to assign. Roles chairperson/secretary/finance only accept a single userId.',
    example: UserRole.MEMBER,
  })
  @IsNotEmpty()
  @IsEnum(UserRole)
  role!: UserRole;
}

// ─── Batch: many users each with their own role ───────────────────────────────

export class BatchUserRoleEntryDto {
  @ApiProperty({ description: 'User UUID' })
  @IsNotEmpty()
  @IsUUID()
  userId!: string;

  @ApiProperty({
    enum: [UserRole.CHAIRPERSON, UserRole.SECRETARY, UserRole.FINANCE, UserRole.MEMBER],
    example: UserRole.MEMBER,
  })
  @IsNotEmpty()
  @IsEnum(UserRole)
  role!: UserRole;
}

export class BatchAssignGroupRolesDto {
  @ApiProperty({
    description: 'List of { userId, role } pairs to assign in one request (min 1)',
    type: [BatchUserRoleEntryDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BatchUserRoleEntryDto)
  assignments!: BatchUserRoleEntryDto[];
}

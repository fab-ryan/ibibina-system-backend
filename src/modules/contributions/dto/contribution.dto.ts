import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ContributionStatus } from '../entities/contribution.entity';
import { PaymentMethod } from '@/enums';

// ─── Period helpers ────────────────────────────────────────────────────────────
// Weekly:  2026-W18
// Monthly: 2026-05
export const PERIOD_REGEX = /^(\d{4}|\d{4}-(0[1-9]|1[0-2]|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|\d{4}-W(0[1-9]|[1-4]\d|5[0-3])(?:-[1-3])?)$/;
export const PERIOD_MESSAGE =
  'period must be "YYYY", "YYYY-MM", "YYYY-MMM", "YYYY-Www", or "YYYY-Www-X" (where X is 1-3)';

// ─── Record a single contribution ─────────────────────────────────────────────

export class RecordContributionDto {
  @ApiProperty({ description: 'Member user UUID' })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({
    example: '2026-W18',
    description:
      'Contribution cycle. Optional: if omitted, backend auto-generates from dueDate and group frequency',
  })
  @IsOptional()
  @IsString()
  @Matches(PERIOD_REGEX, { message: PERIOD_MESSAGE })
  period?: string;

  @ApiProperty({ example: '2026-05-10', description: 'ISO due date for this period' })
  @IsNotEmpty()
  @IsDateString()
    
  dueDate!: string;

  @ApiPropertyOptional({
    example: 1000,
    description: 'Expected contribution amount (defaults to group settings contributionAmount)',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
    @Type(() => Number)
  amount?: number;

  @ApiPropertyOptional({
    example: 800,
    description: 'Actual amount paid (supports partial payments)',
  })
  @IsOptional()
  @IsNumber() 
  @IsPositive()
  @Type(() => Number)
  paidAmount?: number;

  @ApiPropertyOptional({ example: 'RWF', default: 'RWF' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @ApiPropertyOptional({
    example: 5,
    description: 'Cycle sequence number within the group (e.g. 5th contribution)',
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  cycleNumber?: number;

  @ApiPropertyOptional({ enum: ContributionStatus, default: ContributionStatus.PENDING })
  @IsOptional()
  @IsEnum(ContributionStatus)
  status?: ContributionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  momoRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceFileUrl?: string;
}

export class UpdateContributionDto extends PartialType(RecordContributionDto) { }

export class RecordPaymentDto {
  @ApiProperty({ description: 'Member user UUID' })
  @IsUUID()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ example: '2026-05' })
  @IsNotEmpty()
  @IsString()
  @Matches(PERIOD_REGEX, { message: PERIOD_MESSAGE })
  period!: string;

  @ApiProperty({ description: 'Amount being paid' })
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  amount!: number;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── Bulk: one period, many members ───────────────────────────────────────────

export class BulkRecordContributionDto {
  @ApiPropertyOptional({
    example: '2026-W18',
    description:
      'Contribution cycle — same for all entries. Optional: if omitted, backend auto-generates from dueDate and group frequency',
  })
  @IsOptional()
  @IsString()
  @Matches(PERIOD_REGEX, { message: PERIOD_MESSAGE })
  period?: string;

  @ApiProperty({ example: '2026-05-10' })
  @IsNotEmpty()
  @IsDateString()
  dueDate!: string;

  @ApiPropertyOptional({
    example: 1000,
    description: 'Expected contribution amount (defaults to group settings contributionAmount)',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({ example: 'RWF' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @ApiProperty({
    description: 'User UUIDs of members who already paid (min 1)',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  paidUserIds!: string[];
}

// ─── Generate pending placeholders for a whole period ─────────────────────────

export class GeneratePeriodContributionsDto {
  @ApiPropertyOptional({
    example: '2026-W18',
    description: 'Optional: if omitted, backend auto-generates from dueDate and group frequency',
  })
  @IsOptional()
  @IsString()
  @Matches(PERIOD_REGEX, { message: PERIOD_MESSAGE })
  period?: string;

  @ApiProperty({ example: '2026-05-10' })
  @IsNotEmpty()
  @IsDateString()
  dueDate!: string;

  @ApiPropertyOptional({
    description: 'Override amount. Falls back to group settings contributionAmount.',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export class ContributionFilterDto {
  @ApiPropertyOptional({ description: 'Filter by group UUID' })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ description: 'Filter by member user UUID' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ example: '2026-W18' })
  @IsOptional()
  @IsString()
  @Matches(PERIOD_REGEX, { message: PERIOD_MESSAGE })
  period?: string;

  @ApiPropertyOptional({ enum: ContributionStatus })
  @IsOptional()
  @IsEnum(ContributionStatus)
  status?: ContributionStatus;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  limit?: number;
}

// ─── Waive ────────────────────────────────────────────────────────────────────

export class WaiveContributionDto {
  @ApiProperty({ description: 'Reason for waiving this contribution' })
  @IsNotEmpty()
  @IsString()
  reason!: string;
}

export type MemberCycleProgressStatus = 'paid' | 'missed' | 'upcoming' | 'future';

export class MemberCycleProgressQueryDto {
  @ApiPropertyOptional({
    description: 'Target year for cycle progress. Defaults to current year.',
    example: 2026,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({
    description: 'Group UUID. Optional for member role; falls back to authenticated user group.',
  })
  @IsOptional()
  groupId?: string;

  @ApiPropertyOptional({
    description:
      'User UUID of the member to query. Optional for member role; defaults to authenticated user.',
  })
  @IsOptional()
  userId?: string;
}

export class MemberCycleProgressItemDto {
  @ApiProperty({ example: 'Jan' })
  label!: string;

  @ApiProperty({
    enum: ['paid', 'missed', 'upcoming', 'future'],
    example: 'paid',
  })
  status!: MemberCycleProgressStatus;
}

export class MemberCycleProgressResponseDto {
  @ApiProperty({ enum: ['weekly', 'monthly'], example: 'weekly' })
  cadence!: 'weekly' | 'monthly' | 'two' | 'twice_a_week' | 'thrice_a_week' | 'yearly';

  @ApiProperty({ example: '7f2fc845-b0fc-4edf-b5d0-1dce8ad02c6a' })
  groupId!: string;

  @ApiProperty({ example: 2026 })
  year!: number;

  @ApiProperty({ type: MemberCycleProgressItemDto, isArray: true })
  periods!: MemberCycleProgressItemDto[];
}

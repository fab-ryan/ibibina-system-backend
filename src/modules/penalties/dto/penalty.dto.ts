import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PenaltyReason, PenaltyStatus } from '../entities/penalty.entity';
import { PaymentMethod } from '@/enums';

// ─── Issue a penalty ──────────────────────────────────────────────────────────

export class IssuePenaltyDto {
  @ApiProperty({ description: 'Member user UUID' })
  @IsNotEmpty()
  @IsUUID()
  userId!: string;

  @ApiProperty({ description: 'Group UUID' })
  @IsNotEmpty()
  @IsUUID()
  groupId!: string;

  @ApiPropertyOptional({ description: 'Link to the related contribution (optional)' })
  @IsOptional()
  @IsUUID()
  contributionId?: string;

  @ApiProperty({ enum: PenaltyReason, default: PenaltyReason.LATE_PAYMENT })
  @IsEnum(PenaltyReason)
  reason!: PenaltyReason;

  @ApiPropertyOptional({ example: 'Member paid 3 days late' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 500, description: 'Penalty amount' })
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({ example: 'RWF', default: 'RWF' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;
}

export class UpdatePenaltyDto extends PartialType(IssuePenaltyDto) {
  @ApiPropertyOptional({ enum: PenaltyStatus })
  @IsOptional()
  @IsEnum(PenaltyStatus)
  status?: PenaltyStatus;
}

// ─── Settle (pay) a penalty ───────────────────────────────────────────────────

export class SettlePenaltyDto {
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({ example: '2026-05-09T10:00:00Z' })
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @ApiPropertyOptional({ example: 'TXN-20260509-001' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  momoRef?: string;

  @ApiPropertyOptional({ example: 'BNK-REF-00123' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── Waive a penalty ─────────────────────────────────────────────────────────

export class WaivePenaltyDto {
  @ApiProperty({ description: 'Reason for waiving this penalty' })
  @IsNotEmpty()
  @IsString()
  reason!: string;
}

// ─── Filters ─────────────────────────────────────────────────────────────────

export class PenaltyFilterDto {
  @ApiPropertyOptional({ description: 'Filter by group UUID' })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ description: 'Filter by member user UUID' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Filter by related contribution UUID' })
  @IsOptional()
  @IsUUID()
  contributionId?: string;

  @ApiPropertyOptional({ enum: PenaltyStatus })
  @IsOptional()
  @IsEnum(PenaltyStatus)
  status?: PenaltyStatus;

  @ApiPropertyOptional({ enum: PenaltyReason })
  @IsOptional()
  @IsEnum(PenaltyReason)
  reason?: PenaltyReason;

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
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

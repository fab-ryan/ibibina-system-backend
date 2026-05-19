import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@/enums';
import { TransactionStatus, TransactionType } from '../entities/transaction.entity';

// ─── Pay a contribution (POST /contributions/:id/pay) ─────────────────────────

export class PayContributionDto {
  @ApiProperty({ enum: PaymentMethod, description: 'How the payment was made' })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({
    example: 1000,
    description: 'Amount paid — defaults to the contribution amount',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  paidAmount?: number;

  @ApiPropertyOptional({ example: '2026-05-06T10:00:00Z', description: 'When payment was made' })
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @ApiPropertyOptional({ example: 'MM-12345', description: 'MoMo reference (for MOMO payments)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  momoRef?: string;

  @ApiPropertyOptional({
    example: 'BNK-98765',
    description: 'Bank transfer reference (for BANK payments)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankRef?: string;

  @ApiPropertyOptional({ description: 'Optional notes about this payment' })
  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── Pay a penalty (POST /penalties/:id/pay) ──────────────────────────────────

export class PayPenaltyDto extends PayContributionDto {}

// ─── Filters for listing transactions ────────────────────────────────────────

export class TransactionFilterDto {
  @ApiPropertyOptional({ enum: TransactionType })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({ description: 'Filter by userId' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Filter by groupId (admins only)' })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ enum: TransactionStatus })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;
}

// ─── Internal DTO for creating a transaction record ──────────────────────────

export interface CreateTransactionData {
  type: TransactionType;
  referenceId: string;
  userId: string;
  groupId: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  paidAt?: Date;
  momoRef?: string;
  bankRef?: string;
  recordedById?: string;
  notes?: string;
  status?: TransactionStatus;
}

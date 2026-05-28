import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
import { Type } from 'class-transformer';
import { LoanStatus } from '../entities/loan.entity';
import { PaymentMethod } from '@/enums';
import { RepaymentStatus } from '../entities/loan-repayment.entity';
import { StaffGroupInfo } from '@/modules/dashboard/dto/dashboard.dto';

// ─── Request a loan ───────────────────────────────────────────────────────────

export class RequestLoanDto {
  @ApiProperty({ example: 50000, description: 'Loan amount requested' })
  @IsNumber()
  @IsPositive()
  requestedAmount!: number;

  @ApiProperty({ example: 6, description: 'Desired repayment term in months (1–24)' })
  @IsInt()
  @Min(1)
  @Max(24)
  termMonths!: number;

  @ApiProperty({ example: 'Buy farming equipment for next season' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  purpose!: string;

  @ApiPropertyOptional({ example: 'One acre plot as collateral' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  collateralDescription?: string;

  @ApiPropertyOptional({ description: 'Override groupId; admin use only' })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({
    description: 'Member userId; required when requested by staff on behalf of a member',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── Approve a loan ───────────────────────────────────────────────────────────

export class ApproveLoanDto {
  @ApiPropertyOptional({
    example: 45000,
    description: 'Approved amount (defaults to requested amount if omitted)',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  approvedAmount?: number;

  @ApiPropertyOptional({ example: 'Approved at committee meeting on 2026-05-08' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  approvalNotes?: string;
}

// ─── Reject a loan ────────────────────────────────────────────────────────────

export class RejectLoanDto {
  @ApiProperty({ example: 'Member does not meet minimum contribution threshold' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason!: string;
}

// ─── Disburse a loan (admin: initiate repayment schedule) ────────────────────

export class DisburseLoanDto {
  // @ApiProperty({
  //   example: '2026-05-15',
  //   description: 'Date of the first repayment installment',
  // })
  // @IsNotEmpty()
  // @IsDateString()
  // firstRepaymentDate!: string;

  @ApiPropertyOptional({ description: 'Optional notes about the disbursement' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    example: 50000,
    description: 'Disbursed amount (defaults to approved amount if omitted)',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  disbursedAmount?: number;
}

// ─── Record a repayment installment ──────────────────────────────────────────

export class RecordRepaymentDto {
  @ApiProperty({ example: 8500 })
  @IsNumber()
  @IsPositive()
  amountPaid!: number;

  @ApiPropertyOptional({ enum: PaymentMethod, example: PaymentMethod.MOMO })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ example: '2026-05-15T10:00:00Z' })
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @ApiPropertyOptional({ example: 'TXN20260515002' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  momoRef?: string;

  @ApiPropertyOptional({ example: 'BNK20260515002' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    example: '0781234567',
    description: 'Phone number to charge via MoMo (required when paymentMethod is momo)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string;
}

// ─── Mark a repayment as missed ───────────────────────────────────────────────

export class MarkRepaymentMissedDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── Filters ─────────────────────────────────────────────────────────────────

export class LoanFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ enum: LoanStatus })
  @IsOptional()
  @IsEnum(LoanStatus)
  status?: LoanStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class RepaymentFilterDto {
  @ApiPropertyOptional({ enum: RepaymentStatus })
  @IsOptional()
  @IsEnum(RepaymentStatus)
  status?: RepaymentStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

// ─── Loan overview (finance view) ─────────────────────────────────────────────

export type LoanDisplayStatus = 'active' | 'overdue' | 'closed';

export class LoanOverviewQueryDto {
  @ApiPropertyOptional({ description: 'Group UUID (admin only)' })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ enum: ['active', 'overdue', 'closed'], description: 'Filter by status' })
  @IsOptional()
  @IsEnum(['active', 'overdue', 'closed'])
  status?: LoanDisplayStatus;

  @ApiPropertyOptional({ description: 'Search by member name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export interface LoanSummaryStats {
  totalIssued: number;
  totalOutstanding: number;
  interestAccrued: number;
  activeLoans: number;
  overdueCount: number;
}

export interface LoanListItem {
  id: string;
  member: string;
  principal: number;
  repaid: number;
  interestRate: number;
  disbursedOn: string | null;
  dueDate: string | null;
  status: LoanDisplayStatus;
}

export interface LoanOverviewResponse {
  group: Pick<StaffGroupInfo, 'name' | 'code'>;
  summary: LoanSummaryStats;
  loans: LoanListItem[];
  members: string[];
  total: number;
  pagination?: Record<string, any>;
}

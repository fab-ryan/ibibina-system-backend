import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { ReportType } from '../entities/report.entity';

// ─── Generate ────────────────────────────────────────────────────────────────

export class GenerateReportDto {
  @ApiProperty({ enum: ReportType, example: ReportType.MONTHLY })
  @IsEnum(ReportType)
  type!: ReportType;

  /**
   * Period the report covers.
   * - MONTHLY / MEETING: 'YYYY-MM'  e.g. '2026-05'
   * - AUDIT:             'YYYY-Q#'  e.g. '2026-Q1', or 'YYYY' e.g. '2026'
   * - LOANS:             'YYYY'     e.g. '2026'
   */
  @ApiProperty({ example: '2026-05' })
  @IsString()
  period!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ description: 'Custom report name (auto-generated if omitted)' })
  @IsOptional()
  @IsString()
  name?: string;
}

// ─── List ────────────────────────────────────────────────────────────────────

export class ReportListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ enum: ReportType })
  @IsOptional()
  @IsEnum(ReportType)
  type?: ReportType;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}

// ─── Response shapes ─────────────────────────────────────────────────────────

export interface ReportListItem {
  id: string;
  name: string;
  type: ReportType;
  period: string;
  /** Human-readable size, e.g. '124 KB' */
  size: string;
  generatedBy: string | null;
  createdAt: string;
  /** URL of the generated Excel file, null if not yet exported */
  fileUrl: string | null;
}

export interface ReportListResponse {
  reports: ReportListItem[];
  total: number;
  page: number;
  limit: number;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class DashboardQueryDto {
  @ApiPropertyOptional({
    description:
      'Optional group UUID (admin only). Non-admin users are scoped to their auth group.',
  })
  @IsOptional()
  @IsUUID()
  groupId?: string;
}

export interface DashboardOverviewResponse {
  groupId: string;
  totalSavings: number;
  totalMembers: number;
  nextMeeting: string | null;
  joiningDate: string;
}

// ─── Staff dashboard ──────────────────────────────────────────────────────────

export interface StaffGroupInfo {
  name: string;
  code: string;
  totalMembers: number;
  nextMeeting: string | null;
}

export interface StaffDashboardStats {
  totalContributions: number;
  totalLoansIssued: number;
  pendingPenalties: number;
  interestEarned: number;
  cashOnHand: number;
  activeLoanCount: number;
}

export interface RecentActivityItem {
  id: string;
  type: 'contribution' | 'repayment' | 'penalty' | 'loan';
  member: string;
  amount: number;
  date: string;
  status: string;
}

export interface DashboardAlert {
  id: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface StaffDashboardResponse {
  group: StaffGroupInfo;
  stats: StaffDashboardStats;
  recentActivity: RecentActivityItem[];
  alerts: DashboardAlert[];
}

// ─── Loan overview (finance) ──────────────────────────────────────────────────

export type LoanDisplayStatus = 'active' | 'overdue' | 'closed';

export class LoanOverviewQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ enum: ['active', 'overdue', 'closed'] })
  @IsOptional()
  @IsEnum(['active', 'overdue', 'closed'])
  status?: LoanDisplayStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

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
  group: { name: string; code: string };
  summary: LoanSummaryStats;
  loans: LoanListItem[];
  members: string[];
  total: number;
  page: number;
  limit: number;
}

// ─── Contribution overview (finance) ─────────────────────────────────────────

export type ContributionMonthStatus = 'paid' | 'missed' | 'upcoming' | 'future';

export class ContributionOverviewQueryDto {
  @ApiPropertyOptional({
    description: 'Group UUID (admin only). Non-admin users are scoped to their auth group.',
  })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ description: 'Year to display (defaults to current year)', example: 2026 })
  @IsOptional()
  @IsInt()
  @Min(2020)
  @Max(2100)
  @Type(() => Number)
  year?: number;
}

export interface MemberContributionRow {
  id: string;
  name: string;
  /** 12-element array, one per calendar month Jan–Dec */
  months: ContributionMonthStatus[];
  /** Total pending penalty amount for this member in this group */
  penalty: number;
  phoneNumber?: string;
}

export interface ContributionOverviewResponse {
  group: { name: string; code: string };
  /** Current calendar month 1-12 */
  cycleMonth: number;
  /** Configured per-period contribution amount */
  monthlyTarget: number;
  /** Total collected (PAID/LATE) for the year in this group */
  totalCollected: number;
  members: MemberContributionRow[];
}

// ─── Finance overview (chairperson / finance) ─────────────────────────────────

export class FinanceOverviewQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ description: 'Year for monthly breakdown (defaults to current year)' })
  @IsOptional()
  @IsInt()
  @Min(2020)
  @Max(2100)
  @Type(() => Number)
  year?: number;
}

export interface FinanceSummary {
  totalContributions: number;
  totalLoansIssued: number;
  totalRepaid: number;
  interestEarned: number;
  pendingPenalties: number;
  cashOnHand: number;
  activeLoanCount: number;
  memberCount: number;
}

export interface MonthlyBreakdownItem {
  month: string;
  contributions: number;
  repayments: number;
  penalties: number;
}

export interface FinanceOverviewResponse {
  group: { name: string; code: string };
  summary: FinanceSummary;
  monthly: MonthlyBreakdownItem[];
}

export interface AdminOverviewResponse {
  activeUsers: number;
  registeredGroups: number;
  securityScore: number;
  systemUptime: number;
}

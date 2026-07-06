/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
import uuid from "uuid"
import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { AuthUserType } from '@/common/middlewares/authenticate.middleware';
import { UserRole, UserStatus } from '@/modules/users/enums/user-role.enum';
import { User } from '@/modules/users/entities/user.entity';
import { Group } from '@/modules/groups/entities/group.entity';
import {
  Contribution,
  ContributionStatus,
} from '@/modules/contributions/entities/contribution.entity';
import { Loan, LoanStatus } from '@/modules/loans/entities/loan.entity';
import { LoanRepayment, RepaymentStatus } from '@/modules/loans/entities/loan-repayment.entity';
import { Penalty, PenaltyStatus } from '@/modules/penalties/entities/penalty.entity';
import { Transaction, TransactionType } from '@/modules/transactions/entities/transaction.entity';
import { Report, ReportType } from './entities/report.entity';
import {
  GenerateReportDto,
  ReportListItem,
  ReportListQueryDto,
  ReportListResponse,
} from './dto/report.dto';


const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Contribution)
    private readonly contributionRepository: Repository<Contribution>,
    @InjectRepository(Loan)
    private readonly loanRepository: Repository<Loan>,
    @InjectRepository(LoanRepayment)
    private readonly repaymentRepository: Repository<LoanRepayment>,
    @InjectRepository(Penalty)
    private readonly penaltyRepository: Repository<Penalty>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) { }

  // ─── List saved reports ───────────────────────────────────────────────────

  async listReports(actor: AuthUserType, query: ReportListQueryDto): Promise<ReportListResponse> {
    const groupId = this.resolveGroupId(actor, query.groupId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.reportRepository
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.generatedBy', 'user')
      .where('r.groupId = :groupId', { groupId })
      .orderBy('r.createdAt', 'DESC');

    if (query.type) {
      qb.andWhere('r.type = :type', { type: query.type });
    }

    const [rows, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const reports: ReportListItem[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      period: r.period,
      size: this.formatBytes(r.sizeBytes),
      generatedBy: r.generatedBy
        ? `${r.generatedBy.firstName ?? ''} ${r.generatedBy.lastName ?? ''}`.trim()
        : null,
      createdAt: r.createdAt.toISOString().split('T')[0],
      fileUrl: r.fileUrl ?? null,
    }));

    return { reports, total, page, limit };
  }

  // ─── Get one report (with full data) ─────────────────────────────────────

  async getReport(actor: AuthUserType, id: string): Promise<Report> {
    const groupId = this.resolveGroupId(actor, undefined);

    const report = await this.reportRepository
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.generatedBy', 'user')
      .where('r.id = :id', { id })
      .andWhere('r.groupId = :groupId', { groupId })
      .getOne();

    if (!report) throw new NotFoundException(`Report ${id} not found`);
    return report;
  }

  // ─── Generate & save a report ─────────────────────────────────────────────

  async generateReport(actor: AuthUserType, dto: GenerateReportDto): Promise<ReportListItem> {
    const groupId = this.resolveGroupId(actor, dto.groupId);

    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException(`Group ${groupId} not found`);

    let data: Record<string, unknown>;
    let autoName: string;

    switch (dto.type) {
      case ReportType.MONTHLY:
        ({ data, autoName } = await this.buildMonthlyReport(group, dto.period));
        break;
      case ReportType.MEETING:
        ({ data, autoName } = await this.buildMeetingReport(group, dto.period));
        break;
      case ReportType.LOANS:
        ({ data, autoName } = await this.buildLoansReport(group, dto.period));
        break;
      case ReportType.AUDIT:
        ({ data, autoName } = await this.buildAuditReport(group, dto.period));
        break;
      default:
        throw new BadRequestException(`Unknown report type: ${dto.type as string}`);
    }

    // Pre-generate the UUID so we can name the file before saving to DB
    const id = uuid.v4();

    // Write the Excel file first — this is the report artifact, not the raw data
    const { fileUrl, sizeBytes } = this.writeExcel(id, dto.name ?? autoName, data);

    // Save a single record with no raw data payload
    const saved = await this.reportRepository.save(
      this.reportRepository.create({
        id,
        groupId,
        name: dto.name ?? autoName,
        type: dto.type,
        period: dto.period,
        fileUrl,
        sizeBytes,
        generatedById: actor.sub,
      }),
    );

    return {
      id: saved.id,
      name: saved.name,
      type: saved.type,
      period: saved.period,
      size: this.formatBytes(sizeBytes),
      generatedBy: actor.email ?? actor.sub ?? null,
      createdAt: saved.createdAt.toISOString().split('T')[0],
      fileUrl,
    };
  }

  // ─── Monthly statement ────────────────────────────────────────────────────

  private async buildMonthlyReport(
    group: Group,
    period: string,
  ): Promise<{ data: Record<string, unknown>; autoName: string }> {
    const { year, month } = this.parseYearMonth(period);
    if (!month) throw new BadRequestException(`Monthly report requires period in 'YYYY-MM' format`);

    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

    const [contributionsRaw, repaymentsRaw, penaltiesRaw, members, contributions] =
      await Promise.all([
        this.transactionRepository
          .createQueryBuilder('t')
          .select('COALESCE(SUM(t.amount), 0)', 'total')
          .where('t.groupId = :gid', { gid: group.id })
          .andWhere('t.type = :type', { type: TransactionType.CONTRIBUTION })
          .andWhere('t."paidAt" BETWEEN :start AND :end', { start: monthStart, end: monthEnd })
          .getRawOne<{ total: string }>(),

        this.transactionRepository
          .createQueryBuilder('t')
          .select('COALESCE(SUM(t.amount), 0)', 'total')
          .where('t.groupId = :gid', { gid: group.id })
          .andWhere('t.type = :type', { type: TransactionType.LOAN_REPAYMENT })
          .andWhere('t."paidAt" BETWEEN :start AND :end', { start: monthStart, end: monthEnd })
          .getRawOne<{ total: string }>(),

        this.transactionRepository
          .createQueryBuilder('t')
          .select('COALESCE(SUM(t.amount), 0)', 'total')
          .where('t.groupId = :gid', { gid: group.id })
          .andWhere('t.type = :type', { type: TransactionType.PENALTY })
          .andWhere('t."paidAt" BETWEEN :start AND :end', { start: monthStart, end: monthEnd })
          .getRawOne<{ total: string }>(),

        this.userRepository.find({
          where: { groupId: group.id, status: UserStatus.ACTIVE },
          order: { firstName: 'ASC' },
        }),

        this.contributionRepository
          .createQueryBuilder('c')
          .where('c.groupId = :gid', { gid: group.id })
          .andWhere('EXTRACT(YEAR FROM c."dueDate"::date) = :year', { year })
          .andWhere('EXTRACT(MONTH FROM c."dueDate"::date) = :month', { month })
          .getMany(),
      ]);

    const contribByUser = new Map(contributions.map((c) => [c.userId, c]));
    const memberRows = members.map((m) => {
      const c = contribByUser.get(m.id);
      return {
        name: `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim(),
        status: c?.status ?? 'no_record',
        amount: c ? Number(c.paidAmount ?? c.amount) : 0,
      };
    });

    const paid = memberRows.filter(
      (r) => r.status === ContributionStatus.PAID || r.status === ContributionStatus.LATE,
    ).length;

    const label = `${MONTH_LABELS[month - 1]} ${year}`;
    return {
      autoName: `${label} Monthly Statement`,
      data: {
        group: { name: group.name, code: group.groupe_code ?? '' },
        period: label,
        summary: {
          contributions: Number(contributionsRaw?.total ?? 0),
          repayments: Number(repaymentsRaw?.total ?? 0),
          penalties: Number(penaltiesRaw?.total ?? 0),
          membersPaid: paid,
          membersMissed: members.length - paid,
        },
        members: memberRows,
      },
    };
  }

  // ─── Meeting report ───────────────────────────────────────────────────────

  private async buildMeetingReport(
    group: Group,
    period: string,
  ): Promise<{ data: Record<string, unknown>; autoName: string }> {
    // Reuse monthly logic — a meeting covers the same period as the monthly contribution
    return this.buildMonthlyReport(group, period).then(({ data, autoName }) => ({
      data,
      autoName: autoName.replace('Monthly Statement', 'Meeting Report'),
    }));
  }

  // ─── Loan portfolio report ────────────────────────────────────────────────

  private async buildLoansReport(
    group: Group,
    period: string,
  ): Promise<{ data: Record<string, unknown>; autoName: string }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const [loans, overdueIdsRaw] = await Promise.all([
      this.loanRepository
        .createQueryBuilder('l')
        .leftJoinAndSelect('l.user', 'user')
        .where('l.groupId = :gid', { gid: group.id })
        .andWhere('l.status IN (:...statuses)', {
          statuses: [LoanStatus.ACTIVE, LoanStatus.CLOSED, LoanStatus.DEFAULTED],
        })
        .orderBy('l.disbursedAt', 'DESC')
        .getMany(),

      this.loanRepository
        .createQueryBuilder('l')
        .innerJoin(
          'loan_repayments',
          'r',
          'r."loanId" = l.id AND r.status = :pending AND r."dueDate" < :today',
          { pending: RepaymentStatus.PENDING, today: todayStr },
        )
        .where('l.groupId = :gid', { gid: group.id })
        .andWhere('l.status = :active', { active: LoanStatus.ACTIVE })
        .select('l.id', 'id')
        .distinct(true)
        .getRawMany<{ id: string }>(),
    ]);

    const overdueIds = new Set(overdueIdsRaw.map((r) => r.id));

    const totalIssued = loans.reduce((s, l) => s + Number(l.disbursedAmount ?? 0), 0);
    const totalOutstanding = loans
      .filter((l) => l.status === LoanStatus.ACTIVE)
      .reduce((s, l) => s + Number(l.remainingBalance ?? 0), 0);

    const loanRows = loans.map((l) => ({
      id: l.id,
      member: l.user ? `${l.user.firstName ?? ''} ${l.user.lastName ?? ''}`.trim() : 'Unknown',
      principal: Number(l.disbursedAmount ?? l.requestedAmount),
      repaid: Number(l.totalDue ?? 0) - Number(l.remainingBalance ?? 0),
      interestRate: Number(l.interestRate ?? 0) * 100,
      disbursedOn: l.disbursedAt ? new Date(l.disbursedAt).toISOString().split('T')[0] : null,
      status:
        l.status === LoanStatus.ACTIVE ? (overdueIds.has(l.id) ? 'overdue' : 'active') : 'closed',
    }));

    return {
      autoName: `Loan Portfolio Report ${period}`,
      data: {
        group: { name: group.name, code: group.groupe_code ?? '' },
        period,
        summary: {
          totalIssued,
          totalOutstanding,
          activeLoans: loans.filter((l) => l.status === LoanStatus.ACTIVE).length,
          overdueCount: overdueIds.size,
          closedLoans: loans.filter(
            (l) => l.status === LoanStatus.CLOSED || l.status === LoanStatus.DEFAULTED,
          ).length,
        },
        loans: loanRows,
      },
    };
  }

  // ─── Audit report ─────────────────────────────────────────────────────────

  private async buildAuditReport(
    group: Group,
    period: string,
  ): Promise<{ data: Record<string, unknown>; autoName: string }> {
    const { start, end, label } = this.parsePeriodRange(period);

    const [contribRaw, repayRaw, penaltyRaw, loanIssuedRaw, activeLoanCount, pendingPenaltiesRaw] =
      await Promise.all([
        this.transactionRepository
          .createQueryBuilder('t')
          .select('COALESCE(SUM(t.amount), 0)', 'total')
          .where('t.groupId = :gid', { gid: group.id })
          .andWhere('t.type = :type', { type: TransactionType.CONTRIBUTION })
          .andWhere('t."paidAt" BETWEEN :start AND :end', { start, end })
          .getRawOne<{ total: string }>(),

        this.transactionRepository
          .createQueryBuilder('t')
          .select('COALESCE(SUM(t.amount), 0)', 'total')
          .where('t.groupId = :gid', { gid: group.id })
          .andWhere('t.type = :type', { type: TransactionType.LOAN_REPAYMENT })
          .andWhere('t."paidAt" BETWEEN :start AND :end', { start, end })
          .getRawOne<{ total: string }>(),

        this.transactionRepository
          .createQueryBuilder('t')
          .select('COALESCE(SUM(t.amount), 0)', 'total')
          .where('t.groupId = :gid', { gid: group.id })
          .andWhere('t.type = :type', { type: TransactionType.PENALTY })
          .andWhere('t."paidAt" BETWEEN :start AND :end', { start, end })
          .getRawOne<{ total: string }>(),

        this.loanRepository
          .createQueryBuilder('l')
          .select('COALESCE(SUM(l.disbursedAmount), 0)', 'total')
          .where('l.groupId = :gid', { gid: group.id })
          .andWhere('l.disbursedAt BETWEEN :start AND :end', { start, end })
          .getRawOne<{ total: string }>(),

        this.loanRepository.count({ where: { groupId: group.id, status: LoanStatus.ACTIVE } }),

        this.penaltyRepository
          .createQueryBuilder('p')
          .select('COALESCE(SUM(p.amount), 0)', 'total')
          .where('p.groupId = :gid', { gid: group.id })
          .andWhere('p.status = :status', { status: PenaltyStatus.PENDING })
          .getRawOne<{ total: string }>(),
      ]);

    const contributions = Number(contribRaw?.total ?? 0);
    const repayments = Number(repayRaw?.total ?? 0);
    const penalties = Number(penaltyRaw?.total ?? 0);
    const loansIssued = Number(loanIssuedRaw?.total ?? 0);
    const cashOnHand = contributions + repayments - loansIssued;

    return {
      autoName: `${label} Audit Report`,
      data: {
        group: { name: group.name, code: group.groupe_code ?? '' },
        period: label,
        summary: {
          contributions,
          repayments,
          penaltiesCollected: penalties,
          loansIssued,
          cashOnHand,
          activeLoanCount,
          pendingPenalties: Number(pendingPenaltiesRaw?.total ?? 0),
        },
      },
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private resolveGroupId(actor: AuthUserType, requestedGroupId?: string): string {
    if (actor.role === UserRole.ADMIN.toString() && requestedGroupId) return requestedGroupId;
    if (actor.groupId) return actor.groupId;
    throw new BadRequestException(
      'No group found for authenticated user. Provide groupId if you are an admin.',
    );
  }

  private parseYearMonth(period: string): { year: number; month: number | null } {
    const monthly = /^(\d{4})-(\d{2})$/.exec(period);
    if (monthly) return { year: Number(monthly[1]), month: Number(monthly[2]) };
    const yearly = /^(\d{4})$/.exec(period);
    if (yearly) return { year: Number(yearly[1]), month: null };
    throw new BadRequestException(`Cannot parse period '${period}'. Expected 'YYYY-MM' or 'YYYY'.`);
  }

  private parsePeriodRange(period: string): { start: Date; end: Date; label: string } {
    // Quarterly: '2026-Q1'
    const quarterly = /^(\d{4})-Q([1-4])$/.exec(period);
    if (quarterly) {
      const year = Number(quarterly[1]);
      const q = Number(quarterly[2]);
      const startMonth = (q - 1) * 3; // 0-indexed
      const start = new Date(year, startMonth, 1);
      const end = new Date(year, startMonth + 3, 0, 23, 59, 59, 999);
      return { start, end, label: `Q${q} ${year}` };
    }
    // Yearly: '2026'
    const yearly = /^(\d{4})$/.exec(period);
    if (yearly) {
      const year = Number(yearly[1]);
      return {
        start: new Date(year, 0, 1),
        end: new Date(year, 11, 31, 23, 59, 59, 999),
        label: String(year),
      };
    }
    // Monthly: '2026-05'
    const { year, month } = this.parseYearMonth(period);
    if (month) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59, 999);
      return { start, end, label: `${MONTH_LABELS[month - 1]} ${year}` };
    }
    throw new BadRequestException(
      `Cannot parse period '${period}'. Expected 'YYYY', 'YYYY-MM', or 'YYYY-Q#'.`,
    );
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ─── Excel generation ─────────────────────────────────────────────────────

  /**
   * Flattens the report data into worksheets, writes `public/reports/<id>.xlsx`,
   * and returns the public URL and the actual file size in bytes.
   */
  private writeExcel(
    id: string,
    reportName: string,
    data: Record<string, unknown>,
  ): { fileUrl: string; sizeBytes: number } {
    const dir = path.resolve(process.cwd(), 'public', 'reports');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const wb = XLSX.utils.book_new();

    // ── Summary sheet: top-level scalar fields ────────────────────────────
    const summaryRows: Record<string, unknown>[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value) || (typeof value === 'object' && value !== null)) continue;
      summaryRows.push({ Field: key, Value: value });
    }
    if (summaryRows.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');
    }

    // ── Stats sheet: summary sub-object ──────────────────────────────────
    const summary = (data as { summary?: Record<string, unknown> }).summary;
    if (summary && typeof summary === 'object') {
      const rows = Object.entries(summary).map(([k, v]) => ({ Field: k, Value: v }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Stats');
    }

    // ── One sheet per array field (Members, Loans, etc.) ─────────────────
    for (const [key, value] of Object.entries(data)) {
      if (!Array.isArray(value) || value.length === 0) continue;
      const sheetName = key.charAt(0).toUpperCase() + key.slice(1, 31); // max 31 chars
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(value as object[]), sheetName);
    }

    // ── Fallback: workbook must have at least one sheet ───────────────────
    if (wb.SheetNames.length === 0) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet([{ Report: reportName }]),
        'Report',
      );
    }

    const filename = `${id}.xlsx`;
    const filePath = path.join(dir, filename);
    XLSX.writeFile(wb, filePath);

    const sizeBytes = fs.statSync(filePath).size;
    return { fileUrl: `/reports/files/${filename}`, sizeBytes };
  }
}

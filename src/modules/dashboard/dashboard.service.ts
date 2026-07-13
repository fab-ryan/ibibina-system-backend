import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { AuthUserType } from '@/common/middlewares/authenticate.middleware';
import {
  Contribution,
  ContributionStatus,
} from '@/modules/contributions/entities/contribution.entity';
import { Group } from '@/modules/groups/entities/group.entity';
import { User } from '@/modules/users/entities/user.entity';
import { UserRole, UserStatus } from '@/modules/users/enums/user-role.enum';
import { Loan, LoanStatus } from '@/modules/loans/entities/loan.entity';
import { LoanRepayment, RepaymentStatus } from '@/modules/loans/entities/loan-repayment.entity';
import { Penalty, PenaltyStatus } from '@/modules/penalties/entities/penalty.entity';
import { Transaction, TransactionType } from '@/modules/transactions/entities/transaction.entity';
import {
  DashboardAlert,
  DashboardOverviewResponse,
  RecentActivityItem,
  StaffDashboardResponse,
  LoanDisplayStatus,
  LoanListItem,
  LoanOverviewQueryDto,
  LoanOverviewResponse,
  ContributionMonthStatus,
  ContributionOverviewQueryDto,
  ContributionOverviewResponse,
  MemberContributionRow,
  FinanceOverviewQueryDto,
  MonthlyBreakdownItem,
  AdminOverviewResponse,
  FinanceOverviewResponse,
} from './dto/dashboard.dto';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
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
  ) {}

  async getOverview(
    actor: AuthUserType,
    requestedGroupId?: string,
  ): Promise<DashboardOverviewResponse> {
    const groupId = this.resolveGroupId(actor, requestedGroupId);

    const [group, user] = await Promise.all([
      this.groupRepository.findOne({ where: { id: groupId } }),
      this.userRepository.findOne({ where: { id: actor.sub } }),
    ]);

    if (!group) {
      throw new NotFoundException(`Group ${groupId} not found`);
    }

    if (!user) {
      throw new NotFoundException(`User ${actor.sub} not found`);
    }

    const [memberCount, totalSavingsRaw] = await Promise.all([
      this.userRepository.count({ where: { groupId, status: UserStatus.ACTIVE } }),
      this.getGroupSavings(groupId),
    ]);

    return {
      groupId,
      totalSavings: totalSavingsRaw,
      totalMembers: memberCount,
      nextMeeting: this.computeNextMeetingDate(group.settings?.meetingDay),
      joiningDate: user.createdAt.toISOString().slice(0, 10),
    };
  }

  private resolveGroupId(actor: AuthUserType, requestedGroupId?: string): string {
    if (actor.role === UserRole.ADMIN.toString() && requestedGroupId) {
      return requestedGroupId;
    }

    if (actor.groupId) {
      return actor.groupId;
    }

    throw new BadRequestException(
      'No group found for authenticated user. Provide groupId if you are an admin.',
    );
  }

  private async getGroupSavings(groupId: string): Promise<number> {
    const raw = await this.contributionRepository
      .createQueryBuilder('c')
      .select('COALESCE(SUM(COALESCE(c.paidAmount, c.amount)), 0)', 'totalSavings')
      .where('c.groupId = :groupId', { groupId })
      .andWhere('c.status IN (:...statuses)', {
        statuses: [ContributionStatus.PAID, ContributionStatus.LATE],
      })
      .getRawOne<{ totalSavings: string | number }>();

    if (!raw || raw.totalSavings == null) return 0;
    return Number(raw.totalSavings);
  }

  private computeNextMeetingDate(meetingDay?: string): string | null {
    if (!meetingDay) return null;

    const dayIndexMap: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    const normalized = meetingDay.toLowerCase();
    const targetDay = dayIndexMap[normalized];
    if (targetDay === undefined) return null;

    const today = new Date();
    const result = new Date(today);
    const todayDay = today.getDay();
    const diff = (targetDay - todayDay + 7) % 7;
    result.setDate(today.getDate() + diff);

    return result.toISOString().slice(0, 10);
  }

  // ─── Staff dashboard overview ─────────────────────────────────────────────

  async getStaffOverview(
    actor: AuthUserType,
    requestedGroupId?: string,
  ): Promise<StaffDashboardResponse> {
    const groupId = this.resolveGroupId(actor, requestedGroupId);

    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException(`Group ${groupId} not found`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const [
      totalMembers,
      totalContributionsRaw,
      totalLoansIssuedRaw,
      pendingPenaltiesRaw,
      interestEarnedRaw,
      totalRepaidRaw,
      activeLoanCount,
      recentTransactions,
      overdueInstallmentCount,
      pendingPenaltyThisWeek,
    ] = await Promise.all([
      // 1. active member count
      this.userRepository.count({ where: { groupId, status: UserStatus.ACTIVE } }),

      // 2. total contributions collected
      this.contributionRepository
        .createQueryBuilder('c')
        .select('COALESCE(SUM(COALESCE(c.paidAmount, c.amount)), 0)', 'total')
        .where('c.groupId = :groupId', { groupId })
        .andWhere('c.status IN (:...statuses)', {
          statuses: [ContributionStatus.PAID, ContributionStatus.LATE],
        })
        .getRawOne<{ total: string }>(),

      // 3. total loan principal disbursed
      this.loanRepository
        .createQueryBuilder('l')
        .select('COALESCE(SUM(l.disbursedAmount), 0)', 'total')
        .where('l.groupId = :groupId', { groupId })
        .andWhere('l.status IN (:...statuses)', {
          statuses: [LoanStatus.ACTIVE, LoanStatus.CLOSED, LoanStatus.DEFAULTED],
        })
        .getRawOne<{ total: string }>(),

      // 4. pending penalties total
      this.penaltyRepository
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount), 0)', 'total')
        .where('p.groupId = :groupId', { groupId })
        .andWhere('p.status = :status', { status: PenaltyStatus.PENDING })
        .getRawOne<{ total: string }>(),

      // 5. interest earned = SUM(totalDue - disbursedAmount) for active/closed loans
      this.loanRepository
        .createQueryBuilder('l')
        .select('COALESCE(SUM(l.totalDue - l.disbursedAmount), 0)', 'total')
        .where('l.groupId = :groupId', { groupId })
        .andWhere('l.status IN (:...statuses)', {
          statuses: [LoanStatus.ACTIVE, LoanStatus.CLOSED],
        })
        .andWhere('l.totalDue IS NOT NULL')
        .andWhere('l.disbursedAmount IS NOT NULL')
        .getRawOne<{ total: string }>(),

      // 6. total loan repayments received
      this.transactionRepository
        .createQueryBuilder('t')
        .select('COALESCE(SUM(t.amount), 0)', 'total')
        .where('t.groupId = :groupId', { groupId })
        .andWhere('t.type = :type', { type: TransactionType.LOAN_REPAYMENT })
        .getRawOne<{ total: string }>(),

      // 7. active loan count
      this.loanRepository.count({
        where: { groupId, status: LoanStatus.ACTIVE },
      }),

      // 8. recent 10 transactions
      this.transactionRepository
        .createQueryBuilder('t')
        .leftJoinAndSelect('t.user', 'user')
        .where('t.groupId = :groupId', { groupId })
        .orderBy('t.paidAt', 'DESC')
        .take(10)
        .getMany(),

      // 9. overdue installment count (for alerts)
      this.repaymentRepository
        .createQueryBuilder('r')
        .innerJoin('r.loan', 'l')
        .where('l.groupId = :groupId', { groupId })
        .andWhere('r.status = :status', { status: RepaymentStatus.PENDING })
        .andWhere('r.dueDate < :today', { today: todayStr })
        .getCount(),

      // 10. pending penalties created this week (for alerts)
      this.penaltyRepository
        .createQueryBuilder('p')
        .where('p.groupId = :groupId', { groupId })
        .andWhere('p.status = :status', { status: PenaltyStatus.PENDING })
        .andWhere('p.createdAt >= :weekStart', {
          weekStart: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
        })
        .getCount(),
    ]);

    const totalContributions = Number(totalContributionsRaw?.total ?? 0);
    const totalLoansIssued = Number(totalLoansIssuedRaw?.total ?? 0);
    const pendingPenalties = Number(pendingPenaltiesRaw?.total ?? 0);
    const interestEarned = Number(interestEarnedRaw?.total ?? 0);
    const totalRepaid = Number(totalRepaidRaw?.total ?? 0);

    // cash on hand = contributions received + loan repayments - loans disbursed
    const cashOnHand = totalContributions + totalRepaid - totalLoansIssued;

    // ─── Recent activity ───────────────────────────────────────────────────
    const typeMap: Record<TransactionType, RecentActivityItem['type']> = {
      [TransactionType.CONTRIBUTION]: 'contribution',
      [TransactionType.LOAN_REPAYMENT]: 'repayment',
      [TransactionType.PENALTY]: 'penalty',
      [TransactionType.LOAN_DISBURSEMENT]: 'loan',
    };

    const statusMap: Record<TransactionType, string> = {
      [TransactionType.CONTRIBUTION]: 'paid',
      [TransactionType.LOAN_REPAYMENT]: 'paid',
      [TransactionType.PENALTY]: 'paid',
      [TransactionType.LOAN_DISBURSEMENT]: 'disbursed',
    };

    const recentActivity: RecentActivityItem[] = recentTransactions.map((t) => ({
      id: t.id,
      type: typeMap[t.type],
      member: t.user ? `${t.user.firstName} ${t.user.lastName}` : 'Unknown',
      amount: Number(t.amount),
      date: t.paidAt.toISOString().split('T')[0],
      status: statusMap[t.type],
    }));

    // ─── Alerts ────────────────────────────────────────────────────────────
    const alerts: DashboardAlert[] = [];
    let alertIndex = 0;

    if (overdueInstallmentCount > 0) {
      alerts.push({
        id: `alert-${++alertIndex}`,
        message: `${overdueInstallmentCount} member${overdueInstallmentCount > 1 ? 's have' : ' has'} overdue loan installments`,
        severity: 'error',
      });
    }

    if (pendingPenaltyThisWeek > 0) {
      alerts.push({
        id: `alert-${++alertIndex}`,
        message: `${pendingPenaltyThisWeek} pending penalty collection${pendingPenaltyThisWeek > 1 ? 's' : ''} this week`,
        severity: 'warning',
      });
    }

    const nextMeeting = this.computeNextMeetingDate(group.settings?.meetingDay);
    if (nextMeeting) {
      alerts.push({
        id: `alert-${++alertIndex}`,
        message: `Next group meeting on ${nextMeeting}`,
        severity: 'info',
      });
    }

    return {
      group: {
        name: group.name,
        code: group.groupe_code ?? '',
        totalMembers,
        nextMeeting,
      },
      stats: {
        totalContributions,
        totalLoansIssued,
        pendingPenalties,
        interestEarned,
        cashOnHand,
        activeLoanCount,
      },
      recentActivity,
      alerts,
    };
  }

  // ─── Finance: loan overview ───────────────────────────────────────────────

  async getLoanOverview(
    actor: AuthUserType,
    query: LoanOverviewQueryDto,
  ): Promise<LoanOverviewResponse> {
    const groupId = this.resolveGroupId(actor, query.groupId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException(`Group ${groupId} not found`);

    const [summaryRaw, overdueIdsRaw, activeLoanCount] = await Promise.all([
      this.loanRepository
        .createQueryBuilder('l')
        .select('COALESCE(SUM(l.disbursedAmount), 0)', 'totalIssued')
        .addSelect(
          'COALESCE(SUM(CASE WHEN l.status = :active THEN l.remainingBalance ELSE 0 END), 0)',
          'totalOutstanding',
        )
        .addSelect(
          'COALESCE(SUM(CASE WHEN l.status IN (:active2, :closed) AND l.totalDue IS NOT NULL AND l.disbursedAmount IS NOT NULL THEN l.totalDue - l.disbursedAmount ELSE 0 END), 0)',
          'interestAccrued',
        )
        .where('l.groupId = :groupId', { groupId })
        .andWhere('l.status IN (:...displayStatuses)', {
          displayStatuses: [LoanStatus.ACTIVE, LoanStatus.CLOSED, LoanStatus.DEFAULTED],
        })
        .setParameter('active', LoanStatus.ACTIVE)
        .setParameter('active2', LoanStatus.ACTIVE)
        .setParameter('closed', LoanStatus.CLOSED)
        .getRawOne<{ totalIssued: string; totalOutstanding: string; interestAccrued: string }>(),

      this.loanRepository
        .createQueryBuilder('l')
        .innerJoin(
          'loan_repayments',
          'r',
          'r."loanId" = l.id AND r.status = :pending AND r."dueDate" < :today',
          { pending: RepaymentStatus.PENDING, today: todayStr },
        )
        .where('l.groupId = :groupId', { groupId })
        .andWhere('l.status = :active', { active: LoanStatus.ACTIVE })
        .select('l.id', 'id')
        .distinct(true)
        .getRawMany<{ id: string }>(),

      this.loanRepository.count({ where: { groupId, status: LoanStatus.ACTIVE } }),
    ]);

    const overdueIds = new Set(overdueIdsRaw.map((r) => r.id));

    const loanQb = this.loanRepository
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.user', 'user')
      .where('l.groupId = :groupId', { groupId })
      .andWhere('l.status IN (:...displayStatuses)', {
        displayStatuses: [LoanStatus.ACTIVE, LoanStatus.CLOSED, LoanStatus.DEFAULTED],
      })
      .orderBy('l.disbursedAt', 'DESC');

    if (query.status === 'closed') {
      loanQb.andWhere('l.status IN (:...closedStatuses)', {
        closedStatuses: [LoanStatus.CLOSED, LoanStatus.DEFAULTED],
      });
    } else if (query.status === 'active' || query.status === 'overdue') {
      loanQb.andWhere('l.status = :activeStatus', { activeStatus: LoanStatus.ACTIVE });
    }

    if (query.search) {
      loanQb.andWhere(
        "(LOWER(user.firstName) LIKE :search OR LOWER(user.lastName) LIKE :search OR LOWER(CONCAT(user.firstName, ' ', user.lastName)) LIKE :search)",
        { search: `%${query.search.toLowerCase()}%` },
      );
    }

    const allLoans = await loanQb.getMany();

    const mapped: LoanListItem[] = allLoans
      .map((loan) => {
        let status: LoanDisplayStatus;
        if (loan.status === LoanStatus.ACTIVE) {
          status = overdueIds.has(loan.id) ? 'overdue' : 'active';
        } else {
          status = 'closed';
        }
        return {
          id: loan.id,
          member: loan.user
            ? `${loan.user.firstName ?? ''} ${loan.user.lastName ?? ''}`.trim()
            : 'Unknown',
          principal: Number(loan.disbursedAmount ?? loan.requestedAmount),
          repaid: Number(loan.totalDue ?? 0) - Number(loan.remainingBalance ?? 0),
          interestRate: Number(loan.interestRate ?? 0) * 100,
          disbursedOn: loan.disbursedAt
            ? new Date(loan.disbursedAt).toISOString().split('T')[0]
            : null,
          dueDate: this.computeLoanDueDate(loan.firstRepaymentDate, loan.termMonths),
          status,
        };
      })
      .filter((item) => !query.status || item.status === query.status);

    const total = mapped.length;
    const loans = mapped.slice((page - 1) * limit, page * limit);
    const members = [...new Set(mapped.map((l) => l.member).filter(Boolean))].sort();

    return {
      group: { name: group.name, code: group.groupe_code ?? '' },
      summary: {
        totalIssued: Number(summaryRaw?.totalIssued ?? 0),
        totalOutstanding: Number(summaryRaw?.totalOutstanding ?? 0),
        interestAccrued: Number(summaryRaw?.interestAccrued ?? 0),
        activeLoans: activeLoanCount,
        overdueCount: overdueIds.size,
      },
      loans,
      members,
      total,
      page,
      limit,
    };
  }

  private computeLoanDueDate(firstRepaymentDate?: string, termMonths?: number): string | null {
    if (!firstRepaymentDate || !termMonths) return null;
    const d = new Date(firstRepaymentDate);
    d.setUTCMonth(d.getUTCMonth() + termMonths - 1);
    return d.toISOString().split('T')[0];
  }

  // ─── Finance: contribution overview ──────────────────────────────────────
  async getContributionOverview(
    actor: AuthUserType,
    query: ContributionOverviewQueryDto,
  ): Promise<ContributionOverviewResponse> {
    const groupId = this.resolveGroupId(actor, query.groupId);
    const year = query.year ?? new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // 1-12

    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException(`Group ${groupId} not found`);

    const [members, contributions, penaltiesRaw, totalCollectedRaw] = await Promise.all([
      // Active members ordered by name
      this.userRepository.find({
        where: { groupId, status: UserStatus.ACTIVE },
        order: { firstName: 'ASC', lastName: 'ASC' },
      }),

      // All contributions for this group in the given year (use dueDate to derive month)
      this.contributionRepository
        .createQueryBuilder('c')
        .select(['c.userId', 'c.dueDate', 'c.status'])
        .where('c.groupId = :groupId', { groupId })
        .andWhere('EXTRACT(YEAR FROM c."dueDate"::date) = :year', { year })
        .getMany(),

      // Pending penalties per member for this group
      this.penaltyRepository
        .createQueryBuilder('p')
        .select('p.userId', 'userId')
        .addSelect('COALESCE(SUM(p.amount), 0)', 'totalPenalty')
        .where('p.groupId = :groupId', { groupId })
        .andWhere('p.status = :status', { status: PenaltyStatus.PENDING })
        .groupBy('p.userId')
        .getRawMany<{ userId: string; totalPenalty: string }>(),

      // Total collected (PAID/LATE) for this group in the given year
      this.contributionRepository
        .createQueryBuilder('c')
        .select('COALESCE(SUM(COALESCE(c.paidAmount, c.amount)), 0)', 'total')
        .where('c.groupId = :groupId', { groupId })
        .andWhere('EXTRACT(YEAR FROM c."dueDate"::date) = :year', { year })
        .andWhere('c.status IN (:...statuses)', {
          statuses: [ContributionStatus.PAID, ContributionStatus.LATE],
        })
        .getRawOne<{ total: string }>(),
    ]);

    // Build lookup: userId → Map<monthNumber, ContributionStatus[]>
    const frequency = group.settings?.contributionFrequency ?? 'monthly';
    const contribMap = new Map<string, Map<number, ContributionStatus[]>>();
    for (const c of contributions) {
      const monthNum = new Date(c.dueDate).getMonth() + 1; // 1-12
      if (!contribMap.has(c.userId)) contribMap.set(c.userId, new Map());
      const monthMap = contribMap.get(c.userId)!;
      if (!monthMap.has(monthNum)) monthMap.set(monthNum, []);
      monthMap.get(monthNum)!.push(c.status);
    }

    // Penalty lookup: userId → total pending amount
    const penaltyMap = new Map<string, number>();
    for (const p of penaltiesRaw) {
      penaltyMap.set(p.userId, Number(p.totalPenalty));
    }

    // Build member rows
    const memberRows: MemberContributionRow[] = members.map((member) => {
      const memberContribs = contribMap.get(member.id) ?? new Map<number, ContributionStatus[]>();
      const months: ContributionMonthStatus[] = [];

      for (let m = 1; m <= 12; m++) {
        if (m > currentMonth) {
          months.push('future');
          continue;
        }

        const statuses = memberContribs.get(m) ?? [];

        if (m === currentMonth) {
          if (frequency === 'monthly') {
            // One contribution per month: 'paid' if already paid, 'upcoming' otherwise
            const s = statuses[0];
            months.push(
              s === ContributionStatus.PAID || s === ContributionStatus.LATE ? 'paid' : 'upcoming',
            );
          } else {
            // Weekly: 'paid' only if every week this month is paid/late
            const allPaid =
              statuses.length > 0 &&
              statuses.every((s) => s === ContributionStatus.PAID || s === ContributionStatus.LATE);
            months.push(allPaid ? 'paid' : 'upcoming');
          }
        } else {
          // Past month
          if (statuses.length === 0) {
            months.push('missed');
          } else if (frequency === 'monthly') {
            // One expected contribution: use its status directly
            const s = statuses[0];
            months.push(
              s === ContributionStatus.PAID ||
                s === ContributionStatus.LATE ||
                s === ContributionStatus.WAIVED
                ? 'paid'
                : 'missed',
            );
          } else {
            // Weekly: all weeks must be paid/late/waived for the month to be 'paid'
            const allClear = statuses.every(
              (s) =>
                s === ContributionStatus.PAID ||
                s === ContributionStatus.LATE ||
                s === ContributionStatus.WAIVED,
            );
            months.push(allClear ? 'paid' : 'missed');
          }
        }
      }

      return {
        id: member.id,
        name: `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() || 'Unknown',
        months,
        penalty: penaltyMap.get(member.id) ?? 0,
        phoneNumber: member.phone,
      };
    });

    return {
      group: { name: group.name, code: group.groupe_code ?? '' },
      cycleMonth: currentMonth,
      monthlyTarget: Number(group.settings?.contributionAmount ?? 0),
      totalCollected: Number(totalCollectedRaw?.total ?? 0),
      members: memberRows,
    };
  }

  // ─── Finance: full overview (summary + monthly chart) ────────────────────

  async getFinanceOverview(
    actor: AuthUserType,
    query: FinanceOverviewQueryDto,
  ): Promise<FinanceOverviewResponse> {
    const groupId = this.resolveGroupId(actor, query.groupId);
    const year = query.year ?? new Date().getFullYear();

    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException(`Group ${groupId} not found`);

    const [
      memberCount,
      contribRaw,
      loanIssuedRaw,
      repaidRaw,
      interestRaw,
      pendingPenaltiesRaw,
      activeLoanCount,
      monthlyRows,
    ] = await Promise.all([
      this.userRepository.count({ where: { groupId, status: UserStatus.ACTIVE } }),

      this.transactionRepository
        .createQueryBuilder('t')
        .select('COALESCE(SUM(t.amount), 0)', 'total')
        .where('t.groupId = :groupId', { groupId })
        .andWhere('t.type = :type', { type: TransactionType.CONTRIBUTION })
        .getRawOne<{ total: string }>(),

      this.transactionRepository
        .createQueryBuilder('t')
        .select('COALESCE(SUM(t.amount), 0)', 'total')
        .where('t.groupId = :groupId', { groupId })
        .andWhere('t.type = :type', { type: TransactionType.LOAN_DISBURSEMENT })
        .getRawOne<{ total: string }>(),

      this.transactionRepository
        .createQueryBuilder('t')
        .select('COALESCE(SUM(t.amount), 0)', 'total')
        .where('t.groupId = :groupId', { groupId })
        .andWhere('t.type = :type', { type: TransactionType.LOAN_REPAYMENT })
        .getRawOne<{ total: string }>(),

      this.loanRepository
        .createQueryBuilder('l')
        .select('COALESCE(SUM(l.totalDue - l.disbursedAmount), 0)', 'total')
        .where('l.groupId = :groupId', { groupId })
        .andWhere('l.status IN (:...statuses)', {
          statuses: [LoanStatus.ACTIVE, LoanStatus.CLOSED],
        })
        .andWhere('l.totalDue IS NOT NULL')
        .andWhere('l.disbursedAmount IS NOT NULL')
        .getRawOne<{ total: string }>(),

      this.penaltyRepository
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount), 0)', 'total')
        .where('p.groupId = :groupId', { groupId })
        .andWhere('p.status = :status', { status: PenaltyStatus.PENDING })
        .getRawOne<{ total: string }>(),

      this.loanRepository.count({ where: { groupId, status: LoanStatus.ACTIVE } }),

      // Monthly breakdown: contributions, repayments, penalties per month for the year
      this.transactionRepository
        .createQueryBuilder('t')
        .select('EXTRACT(MONTH FROM t."paidAt")', 'month')
        .addSelect(
          'COALESCE(SUM(CASE WHEN t.type = :contrib THEN t.amount ELSE 0 END), 0)',
          'contributions',
        )
        .addSelect(
          'COALESCE(SUM(CASE WHEN t.type = :repay THEN t.amount ELSE 0 END), 0)',
          'repayments',
        )
        .addSelect(
          'COALESCE(SUM(CASE WHEN t.type = :penalty THEN t.amount ELSE 0 END), 0)',
          'penalties',
        )
        .where('t.groupId = :groupId', { groupId })
        .andWhere('EXTRACT(YEAR FROM t."paidAt") = :year', { year })
        .setParameter('contrib', TransactionType.CONTRIBUTION)
        .setParameter('repay', TransactionType.LOAN_REPAYMENT)
        .setParameter('penalty', TransactionType.PENALTY)
        .groupBy('EXTRACT(MONTH FROM t."paidAt")')
        .orderBy('month', 'ASC')
        .getRawMany<{
          month: string;
          contributions: string;
          repayments: string;
          penalties: string;
        }>(),
    ]);

    const MONTH_NAMES = [
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
    const monthMap = new Map(monthlyRows.map((r) => [Math.round(Number(r.month)), r]));
    const currentMonth = new Date().getFullYear() === year ? new Date().getMonth() + 1 : 12;

    const monthly: MonthlyBreakdownItem[] = [];
    for (let m = 1; m <= currentMonth; m++) {
      const row = monthMap.get(m);
      monthly.push({
        month: MONTH_NAMES[m - 1],
        contributions: Number(row?.contributions ?? 0),
        repayments: Number(row?.repayments ?? 0),
        penalties: Number(row?.penalties ?? 0),
      });
    }

    const totalContributions = Number(contribRaw?.total ?? 0);
    const totalLoansIssued = Number(loanIssuedRaw?.total ?? 0);
    const totalRepaid = Number(repaidRaw?.total ?? 0);

    return {
      group: { name: group.name, code: group.groupe_code ?? '' },
      summary: {
        totalContributions,
        totalLoansIssued,
        totalRepaid,
        interestEarned: Number(interestRaw?.total ?? 0),
        pendingPenalties: Number(pendingPenaltiesRaw?.total ?? 0),
        cashOnHand: totalContributions + totalRepaid - totalLoansIssued,
        activeLoanCount,
        memberCount,
      },
      monthly,
    };
  }

  async getAdminOverview(actor: AuthUserType): Promise<AdminOverviewResponse> {
    if (actor.role !== UserRole.ADMIN) {
      throw new BadRequestException('Only admins can access this overview');
    }
    const [activeUsers, registeredGroups] = await Promise.all([
      this.userRepository.count({ where: { status: UserStatus.ACTIVE } }),
      this.groupRepository.count(),
    ]);

    return {
      activeUsers,
      registeredGroups,
      securityScore: 94,
      systemUptime: 99.98,
    };
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUserType } from '@/common/middlewares/authenticate.middleware';
import { UserRole } from '@/modules/users/enums/user-role.enum';
import { User } from '@/modules/users/entities/user.entity';
import { Group } from '@/modules/groups/entities/group.entity';
import {
  Contribution,
  ContributionStatus,
} from '@/modules/contributions/entities/contribution.entity';
import { TransactionsService } from '@/modules/transactions/transactions.service';
import { TransactionType } from '@/modules/transactions/entities/transaction.entity';
import { LoanRepository } from './repositories/loan.repository';
import { LoanRepaymentRepository } from './repositories/loan-repayment.repository';
import type { LoanGroupSummary } from './repositories/loan.repository';
import { Loan, LoanStatus } from './entities/loan.entity';
import { LoanRepayment, RepaymentStatus } from './entities/loan-repayment.entity';
import {
  ApproveLoanDto,
  DisburseLoanDto,
  LoanDisplayStatus,
  LoanFilterDto,
  LoanListItem,
  LoanOverviewQueryDto,
  LoanOverviewResponse,
  MarkRepaymentMissedDto,
  RecordRepaymentDto,
  RejectLoanDto,
  RepaymentFilterDto,
  RequestLoanDto,
} from './dto/loan.dto';
import { PaymentMethod } from '@/enums';
import { PaginateResult, PaginationHelper } from '@/utils/paginate';

const STAFF_ROLES = [UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE, UserRole.SECRETARY];

@Injectable()
export class LoansService {
  constructor(
    private readonly loanRepository: LoanRepository,
    private readonly repaymentRepository: LoanRepaymentRepository,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(Contribution)
    private readonly contributionRepository: Repository<Contribution>,
    private readonly transactionsService: TransactionsService,
    private readonly paginationHelper: PaginationHelper<Loan>,
  ) {}

  // ─── Member requests a loan ───────────────────────────────────────────────

  async request(dto: RequestLoanDto, actor: AuthUserType): Promise<Loan> {
    const userId = dto.userId ?? actor.sub;
    const groupId = dto.groupId ?? actor.groupId;

    if (!groupId) {
      throw new BadRequestException('Authenticated user is not linked to a group');
    }

    // Non-admin staff can only request on behalf of members in their own group
    if (actor.role !== UserRole.ADMIN.toString()) {
      if (dto.userId && dto.userId !== actor.sub && !STAFF_ROLES.includes(actor.role as UserRole)) {
        throw new ForbiddenException('You can only request a loan for yourself');
      }
      if (actor.groupId !== groupId) {
        throw new ForbiddenException('You can only request loans within your own group');
      }
    }

    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException(`Group ${groupId} not found`);

    if (!group.settings?.allowLoans) {
      throw new BadRequestException('Loans are not enabled for this group');
    }

    await this.assertMemberBelongsToGroup(userId, groupId);

    const loanSettings = group.settings?.loanSettings;
    const maxTermMonths = loanSettings?.maxDurationMonths ?? 12;
    if (dto.termMonths > maxTermMonths) {
      throw new BadRequestException(
        `Requested term (${dto.termMonths} months) exceeds the group maximum of ${maxTermMonths} months`,
      );
    }

    // Check minimum contributions requirement
    const minContributions = loanSettings?.minContributionsForLoan ?? 0;
    if (minContributions > 0) {
      const paidCount = await this.contributionRepository.count({
        where: { userId, groupId, status: ContributionStatus.PAID },
      });
      if (paidCount < minContributions) {
        throw new BadRequestException(
          `You need at least ${minContributions} paid contributions to request a loan. You have ${paidCount}.`,
        );
      }
    }

    // Check max loan amount via multiplier
    const multiplier = group.settings?.maxLoanMultiplier ?? 3;
    const totalPaid = await this.contributionRepository
      .createQueryBuilder('c')
      .select(`COALESCE(SUM(c.paidAmount), 0)`, 'total')
      .where('c.userId = :userId', { userId })
      .andWhere('c.groupId = :groupId', { groupId })
      .andWhere('c.status = :status', { status: ContributionStatus.PAID })
      .getRawOne<{ total: string }>();

    const maxLoan = Number(totalPaid?.total ?? 0) * multiplier;
    if (maxLoan > 0 && dto.requestedAmount > maxLoan) {
      throw new BadRequestException(
        `Requested amount (${dto.requestedAmount}) exceeds your maximum eligible loan of ${maxLoan} (${multiplier}× your total contributions).`,
      );
    }

    // Disallow a second active/pending loan
    const existingActive = await this.loanRepository.findOne({
      where: [
        { userId, groupId, status: LoanStatus.PENDING },
        { userId, groupId, status: LoanStatus.APPROVED },
        { userId, groupId, status: LoanStatus.ACTIVE },
      ],
    });
    if (existingActive) {
      throw new BadRequestException(
        `Member already has an active or pending loan (${existingActive.id}). Settle it before requesting another.`,
      );
    }

    const loan = this.loanRepository.create({
      userId,
      groupId,
      requestedAmount: dto.requestedAmount,
      currency: group.settings?.contributionCurrency ?? 'RWF',
      termMonths: dto.termMonths,
      purpose: dto.purpose,
      collateralDescription: dto.collateralDescription,
      status: LoanStatus.PENDING,
      notes: dto.notes,
    });

    return this.loanRepository.save(loan);
  }

  // ─── Approve ──────────────────────────────────────────────────────────────

  async approve(id: string, dto: ApproveLoanDto, actor: AuthUserType): Promise<Loan> {
    const loan = await this.findLoanOrFail(id);
    this.assertStaffAccess(loan.groupId, actor);

    if (loan.status !== LoanStatus.PENDING) {
      throw new BadRequestException(`Loan cannot be approved — current status is "${loan.status}"`);
    }

    const group = await this.groupRepository.findOne({ where: { id: loan.groupId } });
    if (!group) throw new NotFoundException(`Group ${loan.groupId} not found`);

    const loanSettings = group.settings?.loanSettings;
    const interestRate = loanSettings?.interestRate ?? 0.1;

    console.log(dto.approvedAmount, loan.requestedAmount);

    loan.status = LoanStatus.APPROVED;
    loan.approvedById = actor.sub;
    loan.approvedAt = new Date();
    loan.approvalNotes = dto.approvalNotes;
    loan.disbursedAmount = dto.approvedAmount ?? loan.requestedAmount;
    loan.interestRate = interestRate;

    // Pre-compute repayment schedule parameters
    const frequency = group.settings?.contributionFrequency ?? 'monthly';
    const installments = this.computeInstallmentCount(loan.termMonths, frequency);
    const totalDue = this.computeTotalDue(loan.disbursedAmount, interestRate, loan.termMonths);
    const installmentAmount = Math.ceil((totalDue / installments) * 100) / 100;

    loan.totalInstallments = installments;
    loan.totalDue = totalDue;
    loan.installmentAmount = installmentAmount;
    loan.remainingBalance = totalDue;
    loan.settingsSnapshot = {
      interestRate,
      maxDurationMonths: loanSettings?.maxDurationMonths ?? 12,
      collateralRequired: loanSettings?.collateralRequired ?? false,
      maxLoanMultiplier: group.settings?.maxLoanMultiplier ?? 3,
      contributionFrequency: frequency,
    };

    return this.loanRepository.save(loan);
  }

  // ─── Reject ───────────────────────────────────────────────────────────────

  async reject(id: string, dto: RejectLoanDto, actor: AuthUserType): Promise<Loan> {
    const loan = await this.findLoanOrFail(id);
    this.assertStaffAccess(loan.groupId, actor);

    if (loan.status !== LoanStatus.PENDING) {
      throw new BadRequestException(`Loan cannot be rejected — current status is "${loan.status}"`);
    }

    loan.status = LoanStatus.REJECTED;
    loan.rejectedById = actor.sub;
    loan.rejectedAt = new Date();
    loan.rejectionReason = dto.reason;

    return this.loanRepository.save(loan);
  }

  // ─── Disburse ─────────────────────────────────────────────────────────────

  async disburse(id: string, dto: DisburseLoanDto, actor: AuthUserType): Promise<Loan> {
    const loan = await this.findLoanOrFail(id);
    this.assertStaffAccess(loan.groupId, actor);

    if (loan.status !== LoanStatus.APPROVED) {
      throw new BadRequestException(
        `Loan cannot be disbursed — current status is "${loan.status}". Approve it first.`,
      );
    }

    if (!loan.totalInstallments || !loan.installmentAmount || !loan.disbursedAmount) {
      throw new BadRequestException(
        'Loan schedule is incomplete. Re-approve the loan to recalculate.',
      );
    }

    loan.status = LoanStatus.ACTIVE;
    loan.disbursedById = actor.sub;
    loan.disbursedAt = new Date();
    // loan.firstRepaymentDate = dto.firstRepaymentDate;
    loan.disbursedAmount = dto.disbursedAmount ?? loan.disbursedAmount;

    const saved = await this.loanRepository.save(loan);
    const saveDate = new Date();
    // Generate installment records
    await this.generateRepaymentSchedule(saved, saveDate.toISOString().split('T')[0]);

    // Record a disbursement transaction (payment details captured on repayments)
    await this.transactionsService.create({
      type: TransactionType.LOAN_DISBURSEMENT,
      referenceId: loan.id,
      userId: loan.userId,
      groupId: loan.groupId,
      amount: loan.disbursedAmount,
      currency: loan.currency,
      paymentMethod: PaymentMethod.CASH,
      paidAt: new Date(),
      recordedById: actor.sub,
      notes: dto.notes,
    });

    return saved;
  }

  // ─── Record a repayment installment ──────────────────────────────────────

  async recordRepayment(
    loanId: string,
    dto: RecordRepaymentDto,
    actor: AuthUserType,
  ): Promise<LoanRepayment> {
    const loan = await this.findLoanOrFail(loanId);

    if (loan.status !== LoanStatus.ACTIVE) {
      throw new BadRequestException(`Loan is not active (status: ${loan.status})`);
    }

    // Members can only repay their own loan; staff can record for any member in their group
    if (actor.role === UserRole.MEMBER.toString() && loan.userId !== actor.sub) {
      throw new ForbiddenException('You can only repay your own loans');
    }
    if (actor.role !== UserRole.ADMIN.toString() && actor.groupId !== loan.groupId) {
      throw new ForbiddenException('You can only manage loans within your own group');
    }

    const nextInstallment = await this.repaymentRepository.getNextPendingInstallment(loanId);
    if (!nextInstallment) {
      throw new BadRequestException('No pending installments found for this loan');
    }

    const amountPaid = dto.amountPaid;
    const amountDue = Number(nextInstallment.amountDue);

    if (amountPaid > amountDue) {
      throw new BadRequestException(
        `Payment (${amountPaid}) exceeds the installment due (${amountDue})`,
      );
    }

    nextInstallment.amountPaid = amountPaid;
    nextInstallment.status =
      amountPaid >= amountDue ? RepaymentStatus.PAID : RepaymentStatus.PARTIAL;
    nextInstallment.paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    nextInstallment.paymentMethod = dto.paymentMethod;
    nextInstallment.momoRef = dto.momoRef;
    nextInstallment.bankRef = dto.bankRef;
    nextInstallment.recordedById = actor.sub;
    nextInstallment.notes = dto.notes;

    const savedRepayment = await this.repaymentRepository.save(nextInstallment);

    // Update remaining balance
    const newBalance = Math.max(0, Number(loan.remainingBalance ?? 0) - amountPaid);
    loan.remainingBalance = newBalance;

    if (newBalance <= 0) {
      loan.status = LoanStatus.CLOSED;
      loan.closedAt = new Date();
    }

    await this.loanRepository.save(loan);

    // Record a repayment transaction
    await this.transactionsService.create({
      type: TransactionType.LOAN_REPAYMENT,
      referenceId: loanId,
      userId: loan.userId,
      groupId: loan.groupId,
      amount: amountPaid,
      currency: loan.currency,
      paymentMethod: dto.paymentMethod ?? PaymentMethod.CASH,
      paidAt: nextInstallment.paidAt,
      momoRef: dto.momoRef,
      bankRef: dto.bankRef,
      recordedById: actor.sub,
      notes: dto.notes,
    });

    return savedRepayment;
  }

  // ─── Mark installment as missed ───────────────────────────────────────────

  async markRepaymentMissed(
    loanId: string,
    installmentId: string,
    dto: MarkRepaymentMissedDto,
    actor: AuthUserType,
  ): Promise<LoanRepayment> {
    const loan = await this.findLoanOrFail(loanId);
    this.assertStaffAccess(loan.groupId, actor);

    const installment = await this.repaymentRepository.findOne({
      where: { id: installmentId, loanId },
    });
    if (!installment) throw new NotFoundException(`Installment ${installmentId} not found`);

    if (installment.status !== RepaymentStatus.PENDING) {
      throw new BadRequestException(
        `Installment is already "${installment.status}" — cannot mark as missed`,
      );
    }

    installment.status = RepaymentStatus.MISSED;
    installment.notes = dto.notes;

    return this.repaymentRepository.save(installment);
  }

  // ─── Get repayment schedule ───────────────────────────────────────────────

  async getRepaymentSchedule(
    loanId: string,
    filters: RepaymentFilterDto,
    actor: AuthUserType,
  ): Promise<{ data: PaginateResult<LoanRepayment>; loan: Loan }> {
    const loan = await this.findLoanOrFail(loanId);
    this.assertReadAccess(loan, actor);

    const data = await this.repaymentRepository.findByLoan(loanId, filters);
    return { data, loan };
  }

  // ─── List loans ───────────────────────────────────────────────────────────

  async findAll(filters: LoanFilterDto, actor: AuthUserType): Promise<PaginateResult<Loan>> {
    const scoped = this.applyActorScope(filters, actor);
    const result = await this.loanRepository.findWithFilters(scoped);
    return result;
  }

  // ─── Single loan ─────────────────────────────────────────────────────────

  async findOne(id: string, actor: AuthUserType): Promise<Loan> {
    const loan = await this.findLoanOrFail(id);
    this.assertReadAccess(loan, actor);
    return loan;
  }

  // ─── Member's own loans ───────────────────────────────────────────────────

  async getMyLoans(actor: AuthUserType): Promise<Loan[]> {
    return this.loanRepository.find({
      where: { userId: actor.sub },
      order: { createdAt: 'DESC' },
    });
  }

  // ─── Group summary ────────────────────────────────────────────────────────

  async getGroupSummary(groupId: string, actor: AuthUserType): Promise<LoanGroupSummary> {
    this.assertStaffAccess(groupId, actor);
    return this.loanRepository.getGroupSummary(groupId);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /** Weekly: 1 month ≈ 4.33 weeks; monthly: 1 installment per month */
  private computeInstallmentCount(termMonths: number, frequency: 'weekly' | 'monthly'): number {
    if (frequency === 'weekly') {
      return Math.ceil(termMonths * (52 / 12));
    }
    return termMonths;
  }

  /** Simple interest: totalDue = principal × (1 + rate × months) */
  private computeTotalDue(principal: number, monthlyRate: number, months: number): number {
    return Math.ceil(principal * (1 + monthlyRate * months) * 100) / 100;
  }

  /** Build dueDate for each installment from firstRepaymentDate */
  private addPeriods(
    startDate: Date,
    installmentNumber: number,
    frequency: 'weekly' | 'monthly',
  ): Date {
    const d = new Date(startDate);
    if (frequency === 'weekly') {
      d.setUTCDate(d.getUTCDate() + (installmentNumber - 1) * 7);
    } else {
      d.setUTCMonth(d.getUTCMonth() + (installmentNumber - 1));
    }
    return d;
  }

  private async generateRepaymentSchedule(loan: Loan, firstRepaymentDate: string): Promise<void> {
    const total = loan.totalInstallments!;
    const amountDue = loan.installmentAmount!;
    const frequency = loan.settingsSnapshot?.contributionFrequency ?? 'monthly';
    const start = new Date(firstRepaymentDate);

    const installments: Partial<LoanRepayment>[] = Array.from({ length: total }, (_, i) => ({
      loanId: loan.id,
      userId: loan.userId,
      groupId: loan.groupId,
      installmentNumber: i + 1,
      amountDue,
      currency: loan.currency,
      dueDate: this.addPeriods(start, i + 1, frequency)
        .toISOString()
        .split('T')[0],
      status: RepaymentStatus.PENDING,
    }));

    await this.repaymentRepository.save(installments as LoanRepayment[]);
  }

  private async findLoanOrFail(id: string): Promise<Loan> {
    const loan = await this.loanRepository.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!loan) throw new NotFoundException(`Loan ${id} not found`);
    return loan;
  }

  private assertStaffAccess(groupId: string, actor: AuthUserType): void {
    if (actor.role === UserRole.ADMIN.toString()) return;

    if (!STAFF_ROLES.includes(actor.role as UserRole)) {
      throw new ForbiddenException('You do not have permission to manage loans');
    }

    if (actor.groupId !== groupId) {
      throw new ForbiddenException('You can only manage loans within your own group');
    }
  }

  private assertReadAccess(loan: Loan, actor: AuthUserType): void {
    if (actor.role === UserRole.ADMIN.toString()) return;

    if (actor.role === UserRole.MEMBER.toString()) {
      if (actor.sub !== loan.userId) {
        throw new ForbiddenException('Members can only view their own loans');
      }
      return;
    }

    if (actor.groupId !== loan.groupId) {
      throw new ForbiddenException('You can only view loans within your own group');
    }
  }

  private applyActorScope(
    filters: LoanFilterDto,
    actor: AuthUserType,
  ): LoanFilterDto & { userId?: string } {
    const scoped: LoanFilterDto & { userId?: string } = { ...filters };

    if (actor.role === UserRole.MEMBER.toString()) {
      scoped.userId = actor.sub;
    } else if (actor.role !== UserRole.ADMIN.toString()) {
      scoped.groupId = scoped.groupId ?? actor.groupId;
    }

    return scoped;
  }

  private async assertMemberBelongsToGroup(userId: string, groupId: string): Promise<void> {
    const belongs = await this.userRepository.existsBy({ id: userId, groupId });
    if (!belongs) {
      throw new BadRequestException(`User ${userId} is not a member of group ${groupId}`);
    }
  }

  // --- showing allowed loan request for a user ---

  async getAllowedLoanAmount(actor: AuthUserType): Promise<{
    maxLoan: number;
    reason?: string;
    amountDue?: number;
    allowed: boolean;
  }> {
    const userId = actor.sub;
    const groupId = actor.groupId;
    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException(`Group ${groupId} not found`);

    if (!group.settings?.allowLoans) {
      return { maxLoan: 0, reason: 'Loans are not enabled for this group', allowed: false };
    }

    const loanSettings = group.settings?.loanSettings;
    const multiplier = loanSettings?.maxLoanMultiplier ?? 3;

    const totalPaid = await this.contributionRepository
      .createQueryBuilder('c')
      .select(`COALESCE(SUM(c.paidAmount), 0)`, 'total')
      .where('c.userId = :userId', { userId })
      .andWhere('c.groupId = :groupId', { groupId })
      .andWhere('c.status = :status', { status: ContributionStatus.PAID })
      .getRawOne<{ total: string }>();

    const totalDueRow = await this.loanRepository
      .createQueryBuilder('l')
      .select(`COALESCE(SUM(l.remainingBalance), 0)`, 'totalDue')
      .where('l.userId = :userId', { userId })
      .andWhere('l.groupId = :groupId', { groupId })
      .andWhere('l.status IN (:...statuses)', {
        statuses: [LoanStatus.PENDING, LoanStatus.APPROVED, LoanStatus.ACTIVE],
      })
      .getRawOne<{ totalDue: string }>();

    if (totalDueRow && Number(totalDueRow.totalDue) > 0) {
      return {
        maxLoan: 0,
        reason: 'You have an active or pending loan. Settle it before requesting another.',
        amountDue: Number(totalDueRow.totalDue),
        allowed: false,
      };
    }
    const maxLoan = Number(totalPaid?.total ?? 0) * multiplier;

    // Check if user has an active or pending loan
    const existingActive = await this.loanRepository.findOne({
      where: [
        { userId, groupId, status: LoanStatus.PENDING },
        { userId, groupId, status: LoanStatus.APPROVED },
        { userId, groupId, status: LoanStatus.ACTIVE },
      ],
    });

    if (existingActive) {
      return {
        maxLoan: 0,
        reason: 'You have an active or pending loan. Settle it before requesting another.',
        amountDue: Number(totalDueRow?.totalDue ?? 0),
        allowed: false,
      };
    }
    if (maxLoan <= 0) {
      return {
        maxLoan: 0,
        reason: 'You are not eligible for a loan based on your contributions.',
        amountDue: Number(totalDueRow?.totalDue ?? 0),
        allowed: false,
      };
    }

    return { maxLoan, amountDue: Number(totalDueRow?.totalDue ?? 0), allowed: true };
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

    // ── 1. Summary stats (all in one pass) ──────────────────────────────────
    const [summaryRaw, overdueCountRaw, activeLoanCount] = await Promise.all([
      this.loanRepository
        .createQueryBuilder('l')
        .select('COALESCE(SUM(l.disbursedAmount), 0)', 'totalIssued')
        .addSelect(
          'COALESCE(SUM(CASE WHEN l.status = :active THEN l.remainingBalance ELSE 0 END), 0)',
          'totalOutstanding',
        )
        .addSelect(
          'COALESCE(SUM(CASE WHEN l.status IN (:active, :closed) AND l.totalDue IS NOT NULL AND l.disbursedAmount IS NOT NULL THEN l.totalDue - l.disbursedAmount ELSE 0 END), 0)',
          'interestAccrued',
        )
        .where('l.groupId = :groupId', { groupId })
        .andWhere('l.status IN (:...displayStatuses)', {
          displayStatuses: [LoanStatus.ACTIVE, LoanStatus.CLOSED, LoanStatus.DEFAULTED],
        })
        .setParameter('active', LoanStatus.ACTIVE)
        .setParameter('closed', LoanStatus.CLOSED)
        .getRawOne<{ totalIssued: string; totalOutstanding: string; interestAccrued: string }>(),

      // overdue: ACTIVE loans that have at least one PENDING installment past today
      this.loanRepository
        .createQueryBuilder('l')
        .innerJoin(
          'loan_repayments',
          'r',
          'r.loanId = l.id AND r.status = :pending AND r.dueDate < :today',
          { pending: RepaymentStatus.PENDING, today: todayStr },
        )
        .where('l.groupId = :groupId', { groupId })
        .andWhere('l.status = :active', { active: LoanStatus.ACTIVE })
        .select('l.id', 'id')
        .distinct(true)
        .getRawMany<{ id: string }>(),

      this.loanRepository.count({ where: { groupId, status: LoanStatus.ACTIVE } }),
    ]);

    const overdueIds = new Set(overdueCountRaw.map((r) => r.id));

    // ── 2. Fetch loan list ───────────────────────────────────────────────────
    const loanQb = this.loanRepository
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.user', 'user')
      .where('l.groupId = :groupId', { groupId })
      .andWhere('l.status IN (:...displayStatuses)', {
        displayStatuses: [LoanStatus.ACTIVE, LoanStatus.CLOSED, LoanStatus.DEFAULTED],
      })
      .orderBy('l.disbursedAt', 'DESC');

    // Apply status filter
    if (query.status === 'closed') {
      loanQb.andWhere('l.status IN (:...closedStatuses)', {
        closedStatuses: [LoanStatus.CLOSED, LoanStatus.DEFAULTED],
      });
    } else if (query.status === 'active' || query.status === 'overdue') {
      loanQb.andWhere('l.status = :activeStatus', { activeStatus: LoanStatus.ACTIVE });
    }

    // Apply member name search
    if (query.search) {
      loanQb.andWhere(
        "(LOWER(user.firstName) LIKE :search OR LOWER(user.lastName) LIKE :search OR LOWER(CONCAT(user.firstName, ' ', user.lastName)) LIKE :search)",
        { search: `%${query.search.toLowerCase()}%` },
      );
    }

    const allLoans = await this.paginationHelper.run(loanQb); // fetch all for in-memory processing

    // Compute display status and apply 'overdue' / 'active' filter in-memory
    const mapped: LoanListItem[] = allLoans?.items
      ?.map((loan) => {
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
          interestRate: Number(loan.interestRate ?? 0) * 100, // stored as decimal e.g. 0.05 → 5%
          disbursedOn: loan.disbursedAt
            ? new Date(loan.disbursedAt).toISOString().split('T')[0]
            : null,
          dueDate: this.computeLoanDueDate(loan.firstRepaymentDate, loan.termMonths),
          status,
        };
      })
      .filter((item) => {
        if (!query.status) return true;
        return item.status === query.status;
      });

    const total = mapped.length;
    const loans = mapped.slice((page - 1) * limit, page * limit);

    // ── 3. Unique member names for filter dropdown ───────────────────────────
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
      pagination: {
        meta: allLoans?.meta,
        links: allLoans?.links,
      },
    };
  }

  private computeLoanDueDate(firstRepaymentDate?: string, termMonths?: number): string | null {
    if (!firstRepaymentDate || !termMonths) return null;
    const d = new Date(firstRepaymentDate);
    d.setUTCMonth(d.getUTCMonth() + termMonths - 1);
    return d.toISOString().split('T')[0];
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
}

/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { AuthUserType } from '@/common/middlewares/authenticate.middleware';
import { UserRole } from '@/modules/users/enums/user-role.enum';
import { User } from '@/modules/users/entities/user.entity';
import { Group } from '@/modules/groups/entities/group.entity';
import { ContributionRepository } from './repositories/contribution.repository';
import type { ContributionSummary, MemberSummary } from './repositories/contribution.repository';
import {
  Contribution,
  ContributionSettingsSnapshot,
  ContributionStatus,
} from './entities/contribution.entity';
import {
  BulkRecordContributionDto,
  ContributionFilterDto,
  GeneratePeriodContributionsDto,
  MemberCycleProgressQueryDto,
  MemberCycleProgressResponseDto,
  MemberCycleProgressStatus,
  PERIOD_MESSAGE,
  PERIOD_REGEX,
  RecordContributionDto,
  RecordPaymentDto,
  UpdateContributionDto,
  WaiveContributionDto,
} from './dto/contribution.dto';
import { TransactionsService } from '@/modules/transactions/transactions.service';
import {
  TransactionStatus,
  TransactionType,
} from '@/modules/transactions/entities/transaction.entity';
import { PayContributionDto } from '@/modules/transactions/dto/transaction.dto';
import { PaymentMethod } from '@/enums';
import { ActivitiesService } from '../activities/activities.service';
import { PaginateResult } from '@/utils';
import { ResponseService } from '@/common/services/response.service';

/** Roles allowed to record / manage contributions (not members) */
const RECORDER_ROLES = [UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE, UserRole.MEMBER];
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
export class ContributionsService {
  constructor(
    private readonly contributionRepository: ContributionRepository,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    private readonly transactionsService: TransactionsService,
    private readonly activityService: ActivitiesService,
    private readonly responseService: ResponseService,
  ) { }

  // ─── Record a single contribution ─────────────────────────────────────────

  async record(dto: RecordContributionDto, actor: AuthUserType): Promise<Contribution> {
    const groupId = this.requireActorGroupId(actor);
    const { userId, dueDate } = dto;
    if (!userId) {
      throw new BadRequestException('Authenticated user must provide  in the request body');
    }

    await this.assertGroupAccess(groupId, actor);
    await this.assertMemberBelongsToGroup(userId, groupId);

    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException(`Group ${groupId} not found`);
    const period = this.resolvePeriod(dto.period, dueDate, group);
    this.assertPeriodMatchesGroupFrequency(period, group);

    const configuredAmount = group.settings?.contributionAmount;
    const configuredCurrency = group.settings?.contributionCurrency;

    const resolvedAmount = dto.amount ?? configuredAmount;
    if (!resolvedAmount || resolvedAmount <= 0) {
      throw new BadRequestException(
        'Contribution amount is required — either pass amount in request or set contributionAmount in group settings.',
      );
    }

    const alreadyExists = await this.contributionRepository.existsByUserGroupPeriod(
      userId,
      groupId,
      period,
    );
    if (alreadyExists) {
      throw new BadRequestException(
        `A contribution record for user ${userId} in period "${period}" already exists. Use PATCH to update it.`,
      );
    }

    const contribution = this.contributionRepository.create({
      ...dto,
      groupId,
      period,
      amount: resolvedAmount,
      currency: dto.currency ?? configuredCurrency ?? 'RWF',
      status: dto.status ?? ContributionStatus.PENDING,
      paidAmount:
        dto.paidAmount ??
        (dto.status === ContributionStatus.PAID || !dto.status ? resolvedAmount : undefined),
      settingsSnapshot: this.buildSettingsSnapshot(group),
      recordedById: actor.sub,
    });

    return this.contributionRepository.save(contribution);
  }

  // ─── Record Payment directly (Find or Create -> Pay) ─────────────────────

  async recordPayment(
    dto: RecordPaymentDto,
    actor: AuthUserType,
    file?: Express.Multer.File,
  ): Promise<Contribution> {
    const groupId = this.requireActorGroupId(actor);
    const { userId, period, amount, paymentMethod, notes } = dto;

    await this.assertGroupAccess(groupId, actor);
    await this.assertMemberBelongsToGroup(userId, groupId);

    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException(`Group ${groupId} not found`);

    let contribution = await this.contributionRepository.findOne({
      where: { userId, groupId, period },
    });

    if (!contribution) {
      // Create if it doesn't exist
      contribution = this.contributionRepository.create({
        userId,
        groupId,
        period,
        dueDate: new Date().toISOString(), // Default to now if creating on the fly
        amount,
        currency: group.settings?.contributionCurrency ?? 'RWF',
        status: ContributionStatus.PENDING,
        paidAmount: 0,
        settingsSnapshot: this.buildSettingsSnapshot(group),
        recordedById: actor.sub,
        notes,
      });
      contribution = await this.contributionRepository.save(contribution);
    }

    // Now call the existing pay method
    const payDto = {
      paidAmount: amount,
      paymentMethod,
      notes,
    };

    return this.pay(contribution.id, payDto, actor, file as Express.Multer.File);
  }

  async giveContribution(
    dto: RecordContributionDto,
    actor: AuthUserType,
    file?: Express.Multer.File,
  ): Promise<Contribution> {
    const groupId = this.requireActorGroupId(actor);
    const { userId, dueDate, paymentMethod, phoneNumber, bankRef, momoRef } = dto;

    let resolvedUserId = userId;
    if (!resolvedUserId) {
      if (actor.role === UserRole.MEMBER) {
        resolvedUserId = actor.sub;
      }
    }

    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException(`Group ${groupId} not found`);

    const period = this.resolvePeriod(dto.period, dueDate, group);

    try {
      let existing = await this.contributionRepository.findOne({
        where: { userId: resolvedUserId, groupId, period },
      });

      if (!existing) {
        existing = this.contributionRepository.create({
          ...dto,
          userId: resolvedUserId,
          groupId,
          period,
          status: ContributionStatus.PENDING,
          paidAmount: 0,
        });
        existing = await this.contributionRepository.save(existing);
      }

      if (existing.status === ContributionStatus.WAIVED) {
        throw new BadRequestException(
          `Contribution for period "${existing.period}" has been waived and cannot be paid.`,
        );
      }

      const totalDue = Number(existing.amount ?? dto.amount ?? 0);
      const alreadyPaid = Number(existing.paidAmount ?? 0);

      if (totalDue > 0 && alreadyPaid >= totalDue) {
        throw new BadRequestException(
          `Contribution for period "${existing.period}" is already fully paid.`,
        );
      }

      const payingNow = Number(dto.paidAmount ?? totalDue - alreadyPaid);

      // Keep status as PENDING for members, until verified by a Treasurer
      // For MoMo, the webhook will update the status and paidAmount automatically.
      existing.status = ContributionStatus.PENDING;
      await this.contributionRepository.save(existing);
      await this.activityService.logContributionActivity(existing, actor);

      if (paymentMethod) {
        let referenceFileUrl = dto.referenceFileUrl;
        if (file) {
          referenceFileUrl = `/uploads/${file.filename}`;
        }

        await this.transactionsService.create({
          type: TransactionType.CONTRIBUTION,
          referenceId: existing.id,
          userId: existing.userId,
          groupId: existing.groupId,
          amount: payingNow,
          currency: existing.currency ?? 'RWF',
          paymentMethod,
          paidAt: new Date(),
          momoRef,
          bankRef,
          referenceFileUrl,
          recordedById: actor.sub,
          phoneNumber,
          notes: dto.notes,
        });
      }

      return existing;
    } catch (error) {
      const { message } = error instanceof Error ? error : { message: 'Unknown error' };
      throw new BadRequestException(message, message);
    }
  }
  // ─── Bulk: mark multiple members as paid for same period ──────────────────

  async bulkRecord(
    dto: BulkRecordContributionDto,
    actor: AuthUserType,
  ): Promise<{ succeeded: Contribution[]; failed: Array<{ userId: string; reason: string }> }> {
    const groupId = this.requireActorGroupId(actor);
    const { dueDate, amount, currency, paidUserIds } = dto;

    await this.assertGroupAccess(groupId, actor);

    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException(`Group ${groupId} not found`);
    const period = this.resolvePeriod(dto.period, dueDate, group);
    this.assertPeriodMatchesGroupFrequency(period, group);

    const resolvedAmount = amount ?? group.settings?.contributionAmount;
    if (!resolvedAmount || resolvedAmount <= 0) {
      throw new BadRequestException(
        'Contribution amount is required — either pass amount in request or set contributionAmount in group settings.',
      );
    }

    const resolvedCurrency = currency ?? group.settings?.contributionCurrency ?? 'RWF';
    const settingsSnapshot = this.buildSettingsSnapshot(group);

    const succeeded: Contribution[] = [];
    const failed: Array<{ userId: string; reason: string }> = [];

    for (const userId of paidUserIds) {
      try {
        const memberInGroup = await this.userRepository.existsBy({ id: userId, groupId });
        if (!memberInGroup) {
          failed.push({ userId, reason: `User is not an active member of group ${groupId}` });
          continue;
        }

        const alreadyExists = await this.contributionRepository.existsByUserGroupPeriod(
          userId,
          groupId,
          period,
        );
        if (alreadyExists) {
          failed.push({ userId, reason: `Contribution for period "${period}" already recorded` });
          continue;
        }

        const contribution = this.contributionRepository.create({
          userId,
          groupId,
          period,
          dueDate,
          amount: resolvedAmount,
          paidAmount: resolvedAmount,
          currency: resolvedCurrency,
          status: ContributionStatus.PAID,
          settingsSnapshot,
          recordedById: actor.sub,
        });

        succeeded.push(await this.contributionRepository.save(contribution));
        await this.activityService.logContributionActivity(contribution, actor);
        await this.transactionsService.create({
          type: TransactionType.CONTRIBUTION,
          referenceId: contribution.id,
          userId,
          groupId,
          amount: resolvedAmount,
          currency: resolvedCurrency,
          paymentMethod: PaymentMethod.CASH,
          paidAt: new Date(),
          recordedById: actor.sub,
          status: TransactionStatus.COMPLETED,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        failed.push({ userId, reason: message });
      }
    }

    return { succeeded, failed };
  }

  // ─── Generate PENDING placeholders for all group members ──────────────────

  async generatePeriodContributions(
    dto: GeneratePeriodContributionsDto,
    actor: AuthUserType,
  ): Promise<{ created: number; skipped: number }> {
    const groupId = this.requireActorGroupId(actor);
    const { dueDate, currency } = dto;

    await this.assertGroupAccess(groupId, actor);

    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException(`Group ${groupId} not found`);
    const period = this.resolvePeriod(dto.period, dueDate, group);
    this.assertPeriodMatchesGroupFrequency(period, group);

    const contributionAmount = dto.amount ?? group.settings?.contributionAmount;
    if (!contributionAmount || contributionAmount <= 0) {
      throw new BadRequestException(
        'Contribution amount is required — either pass it in the request or set contributionAmount in group settings.',
      );
    }

    const members = await this.userRepository.find({ where: { groupId } });
    if (members.length === 0) {
      return { created: 0, skipped: 0 };
    }

    let created = 0;
    let skipped = 0;

    for (const member of members) {
      const exists = await this.contributionRepository.existsByUserGroupPeriod(
        member.id,
        groupId,
        period,
      );
      if (exists) {
        skipped++;
        continue;
      }

      const contribution = this.contributionRepository.create({
        userId: member.id,
        groupId,
        period,
        dueDate,
        amount: contributionAmount,
        currency: currency ?? group.settings?.contributionCurrency ?? 'RWF',
        status: ContributionStatus.PENDING,
        settingsSnapshot: this.buildSettingsSnapshot(group),
        recordedById: actor.sub,
      });

      await this.contributionRepository.save(contribution);
      created++;
    }

    return { created, skipped };
  }

  // ─── List contributions ────────────────────────────────────────────────────

  async findAll(filters: ContributionFilterDto, actor: AuthUserType) {
    const scopedFilters = this.applyActorScope(filters, actor);
    const result = await this.contributionRepository.findWithFilters(scopedFilters);
    return this.responseService.response({
      data: result,
      message: 'Contributions retrieved successfully',
    });
  }

  // ─── Single contribution ───────────────────────────────────────────────────

  async findOne(id: string, actor: AuthUserType): Promise<Contribution> {
    const contribution = await this.contributionRepository.findOne({
      where: { id },
      relations: ['user', 'group'],
    });
    if (!contribution) throw new NotFoundException(`Contribution ${id} not found`);

    this.assertReadAccess(contribution, actor);
    return contribution;
  }

  // ─── Update a contribution ─────────────────────────────────────────────────

  async update(id: string, dto: UpdateContributionDto, actor: AuthUserType): Promise<Contribution> {
    const contribution = await this.contributionRepository.findOne({
      where: { id },
      relations: ['user', 'group'],
    });
    if (!contribution) throw new NotFoundException(`Contribution ${id} not found`);

    await this.assertGroupAccess(contribution.groupId, actor);

    if (dto.period) {
      const group = await this.groupRepository.findOne({ where: { id: contribution.groupId } });
      if (!group) throw new NotFoundException(`Group ${contribution.groupId} not found`);
      this.assertPeriodMatchesGroupFrequency(dto.period, group);
    }

    const { ...rest } = dto;
    Object.assign(contribution, rest);
    return this.contributionRepository.save(contribution);
  }

  // ─── Pay an existing contribution ───────────────────────────────────────────

  async pay(
    id: string,
    dto: PayContributionDto,
    actor: AuthUserType,
    file: Express.Multer.File,
  ): Promise<Contribution> {
    try {

      const contribution = await this.contributionRepository.findOne({ where: { id } });
      if (!contribution) throw new NotFoundException(`Contribution ${id} not found`);

      await this.assertGroupAccess(contribution.groupId, actor);

      if (contribution.status === ContributionStatus.PAID) {
        throw new BadRequestException('Contribution is already paid');
      }
      if (contribution.status === ContributionStatus.WAIVED) {
        throw new BadRequestException('A waived contribution cannot be paid');
      }

      const alreadyPaid = Number(contribution.paidAmount ?? 0);
      const totalDue = Number(contribution.amount);
      const remaining = totalDue - alreadyPaid;

      if (remaining <= 0) {
        throw new BadRequestException('Contribution is already fully paid');
      }

      // Default: pay the full remaining balance
      const payingNow = dto.paidAmount ?? remaining;

      if (payingNow <= 0) {
        throw new BadRequestException('Payment amount must be greater than zero');
      }
      if (payingNow > remaining) {
        throw new BadRequestException(
          `Payment amount (${payingNow}) exceeds the remaining balance (${remaining})`,
        );
      }

      const newTotalPaid = alreadyPaid + payingNow;
      const isFullyPaid = newTotalPaid >= totalDue;
      const isMomo = dto.paymentMethod === PaymentMethod.MOMO;
      const isMember = actor.role === 'member';

      // For MoMo: leave status/paidAmount unchanged — webhook will confirm and update
      // For CASH/BANK by MEMBER: leave unchanged — treasurer will verify and confirm
      // For CASH/BANK by ADMIN: update immediately
      if (!isMomo && !isMember) {
        contribution.paidAmount = newTotalPaid;
        contribution.status = isFullyPaid ? ContributionStatus.PAID : ContributionStatus.PARTIAL;
      }

      const saved = await this.contributionRepository.save(contribution);
      if (file) {
        const fileUrl = `/uploads/${file.filename}`;
        dto.referenceFileUrl = fileUrl;
      }
      await this.transactionsService.create({
        type: TransactionType.CONTRIBUTION,
        referenceId: contribution.id,
        userId: contribution.userId,
        groupId: contribution.groupId,
        amount: payingNow,
        currency: contribution.currency,
        paymentMethod: dto.paymentMethod,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        momoRef: dto.momoRef,
        bankRef: dto.bankRef,
        referenceFileUrl: dto.referenceFileUrl,
        recordedById: actor.sub,
        phoneNumber: dto.phoneNumber,
        notes: dto.notes,
        status: (!isMomo && isMember) ? TransactionStatus.PENDING : TransactionStatus.PENDING,
      });

      return saved;
    }
    catch (error) {
      throw new BadRequestException(error, error.message);
    }
  }

  // ─── Waive a contribution ──────────────────────────────────────────────────

  async waive(id: string, dto: WaiveContributionDto, actor: AuthUserType): Promise<Contribution> {
    const contribution = await this.contributionRepository.findOne({ where: { id } });
    if (!contribution) throw new NotFoundException(`Contribution ${id} not found`);

    await this.assertGroupAccess(contribution.groupId, actor);

    contribution.status = ContributionStatus.WAIVED;
    contribution.waivedAt = new Date();
    contribution.waivedById = actor.sub;
    contribution.waivedReason = dto.reason;
    return this.contributionRepository.save(contribution);
  }

  // ─── Mark whole period as missed ──────────────────────────────────────────

  async markPeriodMissed(
    groupId: string,
    period: string,
    actor: AuthUserType,
  ): Promise<{ affected: number }> {
    await this.assertGroupAccess(groupId, actor);
    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException(`Group ${groupId} not found`);
    this.assertPeriodMatchesGroupFrequency(period, group);
    const affected = await this.contributionRepository.markPeriodAsMissed(groupId, period);
    return { affected };
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async remove(id: string, actor: AuthUserType): Promise<void> {
    const contribution = await this.contributionRepository.findOne({ where: { id } });
    if (!contribution) throw new NotFoundException(`Contribution ${id} not found`);

    if (actor.role !== UserRole.ADMIN.toString()) {
      throw new ForbiddenException('Only admins can delete contribution records');
    }

    await this.contributionRepository.remove(contribution);
  }

  // ─── Group summary ────────────────────────────────────────────────────────

  async getGroupSummary(
    groupId: string,
    period: string | undefined,
    actor: AuthUserType,
  ): Promise<ContributionSummary> {
    await this.assertGroupAccess(groupId, actor);
    return this.contributionRepository.getGroupSummary(groupId, period);
  }

  // ─── Member summary ───────────────────────────────────────────────────────

  async getMemberSummary(
    userId: string,
    groupId: string,
    actor: AuthUserType,
  ): Promise<MemberSummary> {
    // Members can only view their own summary
    if (actor.role === UserRole.MEMBER.toString() && actor.sub !== userId) {
      throw new ForbiddenException('Members can only view their own contribution summary');
    }
    await this.assertGroupAccess(groupId, actor);
    return this.contributionRepository.getMemberSummary(userId ?? actor.sub, groupId);
  }

  async getMemberCycleProgress(
    query: MemberCycleProgressQueryDto,
    actor: AuthUserType,
  ): Promise<MemberCycleProgressResponseDto> {
    const targetYear = query.year ?? new Date().getUTCFullYear();
    const groupId = query.groupId ?? actor.groupId;

    if (!groupId) {
      throw new BadRequestException('groupId is required when authenticated user has no group');
    }
    if (query.userId && actor.role === UserRole.MEMBER.toString() && actor.sub !== query.userId) {
      throw new ForbiddenException('Members can only view their own cycle progress');
    }

    if (actor.role !== UserRole.ADMIN.toString() && actor.groupId !== groupId) {
      throw new ForbiddenException('You can only view cycle progress within your own group');
    }

    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException(`Group ${groupId} not found`);
    }
    const cadence = group.settings?.contributionFrequency ?? 'weekly';

    await this.assertMemberBelongsToGroup(query.userId ?? actor.sub, groupId);

    const yearStart = `${targetYear}-01-01`;
    const yearEnd = `${targetYear}-12-31`;

    const contributions = await this.contributionRepository.find({
      where: {
        userId: query.userId ?? actor.sub,
        groupId,
        dueDate: Between(yearStart, yearEnd),
      },
      select: {
        period: true,
        dueDate: true,
        status: true,
      },
    });

    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth();
    const { weekYear: currentWeekYear, week: currentWeek } = this.getIsoWeekYear(now);

    const getStatusFromSet = (statuses: Set<ContributionStatus>): MemberCycleProgressStatus => {
      if (
        statuses.has(ContributionStatus.PAID) ||
        statuses.has(ContributionStatus.LATE) ||
        statuses.has(ContributionStatus.WAIVED)
      ) {
        return 'paid';
      }

      if (statuses.has(ContributionStatus.MISSED)) {
        return 'missed';
      }

      return 'upcoming';
    };

    if (cadence === 'weekly') {
      const weeklyStatuses = new Map<number, Set<ContributionStatus>>();
      for (const item of contributions) {
        const matched = item.period.match(/^\d{4}-W(\d{2})$/);
        if (!matched) continue;

        const weekNumber = Number(matched[1]);
        const statuses = weeklyStatuses.get(weekNumber) ?? new Set<ContributionStatus>();
        statuses.add(item.status);
        weeklyStatuses.set(weekNumber, statuses);
      }

      const totalWeeks = this.getIsoWeeksInYear(targetYear);
      const periods = Array.from({ length: totalWeeks }, (_, index) => {
        const weekNumber = index + 1;
        const label = `${targetYear}-W${`${weekNumber}`.padStart(2, '0')}`;
        const statuses = weeklyStatuses.get(weekNumber);

        if (statuses && statuses.size > 0) {
          return { label, status: getStatusFromSet(statuses) };
        }

        let status: MemberCycleProgressStatus;
        if (targetYear < currentWeekYear) {
          status = 'missed';
        } else if (targetYear > currentWeekYear) {
          status = 'future';
        } else if (weekNumber < currentWeek) {
          status = 'missed';
        } else if (weekNumber === currentWeek) {
          status = 'upcoming';
        } else {
          status = 'future';
        }

        return { label, status };
      });

      return {
        cadence,
        groupId,
        year: targetYear,
        periods,
      };
    }
    if (cadence === 'yearly') {
      const yearlyStatuses = new Set<ContributionStatus>();
      for (const item of contributions) {
        if (item.period === `${targetYear}`) {
          yearlyStatuses.add(item.status);
        }
      }

      let status: MemberCycleProgressStatus;
      if (yearlyStatuses.size > 0) {
        status = getStatusFromSet(yearlyStatuses);
      } else if (targetYear < currentYear) {
        status = 'missed';
      } else if (targetYear > currentYear) {
        status = 'future';
      } else {
        status = 'upcoming';
      }

      return {
        cadence,
        groupId,
        year: targetYear,
        periods: [{ label: `${targetYear}`, status }],
      };
    }

    if (['twice_a_week', 'thrice_a_week', 'two'].includes(cadence)) {
      const multiplier = cadence === 'thrice_a_week' ? 3 : 2;
      const multiWeeklyStatuses = new Map<string, Set<ContributionStatus>>();

      for (const item of contributions) {
        const matched = item.period.match(/^\d{4}-W(\d{2})-(\d)$/);
        const fallbackMatched = item.period.match(/^\d{4}-W(\d{2})$/);
        const weekNumber = matched ? Number(matched[1]) : (fallbackMatched ? Number(fallbackMatched[1]) : null);
        const subCycle = matched ? Number(matched[2]) : 1;

        if (weekNumber) {
          const key = `${weekNumber}-${subCycle}`;
          const statuses = multiWeeklyStatuses.get(key) ?? new Set<ContributionStatus>();
          statuses.add(item.status);
          multiWeeklyStatuses.set(key, statuses);
        }
      }

      const totalWeeks = this.getIsoWeeksInYear(targetYear);
      const periods = [];

      for (let weekIndex = 1; weekIndex <= totalWeeks; weekIndex++) {
        for (let subCycle = 1; subCycle <= multiplier; subCycle++) {
          const weekLabel = `${weekIndex}`.padStart(2, '0');
          const label = `${targetYear}-W${weekLabel}-${subCycle}`;
          const key = `${weekIndex}-${subCycle}`;
          const statuses = multiWeeklyStatuses.get(key);

          if (statuses && statuses.size > 0) {
            periods.push({ label, status: getStatusFromSet(statuses) } as never);
            continue;
          }

          let status: MemberCycleProgressStatus;
          if (targetYear < currentWeekYear) {
            status = 'missed';
          } else if (targetYear > currentWeekYear) {
            status = 'future';
          } else if (weekIndex < currentWeek) {
            status = 'missed';
          } else if (weekIndex === currentWeek) {
            status = 'upcoming';
          } else {
            status = 'future';
          }

          periods.push({ label, status } as never);
        }
      }

      return {
        cadence,
        groupId,
        year: targetYear,
        periods,
      };
    }

    const monthlyStatuses = new Map<number, Set<ContributionStatus>>();
    for (const item of contributions) {
      const monthIndex = new Date(item.dueDate).getUTCMonth();
      const statuses = monthlyStatuses.get(monthIndex) ?? new Set<ContributionStatus>();
      statuses.add(item.status);
      monthlyStatuses.set(monthIndex, statuses);
    }

    const periods = MONTH_LABELS.map((label, monthIndex) => {

      const statuses = monthlyStatuses.get(monthIndex);
      let status: MemberCycleProgressStatus;

      if (statuses && statuses.size > 0) {
        status = getStatusFromSet(statuses);
      } else if (targetYear < currentYear) {
        status = 'missed';
      } else if (targetYear > currentYear) {
        status = 'future';
      } else if (monthIndex < currentMonth) {
        status = 'missed';
      } else if (monthIndex === currentMonth) {
        status = 'upcoming';
      } else {
        status = 'future';
      }

      return { label: targetYear + '-' + label, status };
    });

    return {
      cadence,
      groupId,
      year: targetYear,
      periods,
    };
  }

  // ─── Guards / scope helpers ───────────────────────────────────────────────

  private async assertGroupAccess(groupId: string, actor: AuthUserType): Promise<void> {
    const groupExists = await this.groupRepository.existsBy({ id: groupId });
    if (!groupExists) throw new NotFoundException(`Group ${groupId} not found`);

    if (actor.role === UserRole.ADMIN.toString()) return;

    if (!RECORDER_ROLES.includes(actor.role as UserRole)) {
      throw new ForbiddenException('You do not have permission to manage contributions');
    }

    // Non-admin must belong to the target group
    if (actor.groupId !== groupId) {
      throw new ForbiddenException('You can only manage contributions within your own group');
    }
  }

  private async assertMemberBelongsToGroup(userId: string, groupId: string): Promise<void> {
    const belongs = await this.userRepository.existsBy({ id: userId, groupId });
    if (!belongs) {
      throw new BadRequestException(`User ${userId} is not a member of group ${groupId}`);
    }
  }

  private assertReadAccess(contribution: Contribution, actor: AuthUserType): void {
    if (actor.role === UserRole.ADMIN.toString()) return;

    if (actor.role === UserRole.MEMBER.toString()) {
      if (actor.sub !== contribution.userId) {
        throw new ForbiddenException('Members can only view their own contributions');
      }
      return;
    }

    // Chairperson / finance / secretary — must be same group
    if (actor.groupId !== contribution.groupId) {
      throw new ForbiddenException('You can only view contributions within your own group');
    }
  }

  private applyActorScope(
    filters: ContributionFilterDto,
    actor: AuthUserType,
  ): ContributionFilterDto {
    const scoped = { ...filters };

    if (actor.role === UserRole.MEMBER.toString()) {
      // Members can only see their own contributions
      scoped.userId = actor.sub;
      return scoped;
    }

    if (actor.role !== UserRole.ADMIN.toString()) {
      // Chairperson / finance / secretary must be scoped to their group
      scoped.groupId = actor.groupId;
    }

    return scoped;
  }

  private requireActorGroupId(actor: AuthUserType): string {
    if (!actor.groupId) {
      throw new BadRequestException('Authenticated user is not linked to a group');
    }
    return actor.groupId;
  }

  private buildSettingsSnapshot(group: Group): ContributionSettingsSnapshot {
    return {
      contributionAmount: group.settings?.contributionAmount,
      contributionCurrency: group.settings?.contributionCurrency,
      contributionFrequency: group.settings?.contributionFrequency,
      gracePeriodDays: group.settings?.gracePeriodDays,
      meetingDay: group.settings?.meetingDay,
    };
  }

  private assertPeriodMatchesGroupFrequency(period: string, group: Group): void {
    if (!PERIOD_REGEX.test(period)) {
      throw new BadRequestException(PERIOD_MESSAGE);
    }

    const frequency = group.settings?.contributionFrequency ?? 'weekly';
    const weeklyPattern = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;
    const weeklyMultiplePattern = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])-[1-3]$/;
    const monthlyPattern = /^\d{4}-(0[1-9]|1[0-2]|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/;
    const yearlyPattern = /^\d{4}$/;

    if (frequency === 'weekly' && !weeklyPattern.test(period)) {
      throw new BadRequestException(
        `Period "${period}" is invalid for weekly group setting. Use format YYYY-Www (e.g. 2026-W18).`,
      );
    }

    if (frequency === 'monthly' && !monthlyPattern.test(period)) {
      throw new BadRequestException(
        `Period "${period}" is invalid for monthly group setting. Use format YYYY-MM or YYYY-MMM (e.g. 2026-05 or 2026-May).`,
      );
    }

    if (frequency === 'yearly' && !yearlyPattern.test(period)) {
      throw new BadRequestException(
        `Period "${period}" is invalid for yearly group setting. Use format YYYY (e.g. 2026).`,
      );
    }

    if ((frequency === 'twice_a_week' || frequency === 'thrice_a_week' || frequency === 'two') && !weeklyMultiplePattern.test(period) && !weeklyPattern.test(period)) {
      throw new BadRequestException(
        `Period "${period}" is invalid for multi-weekly group setting. Use format YYYY-Www or YYYY-Www-X (e.g. 2026-W18-1).`,
      );
    }
  }

  private resolvePeriod(period: string | undefined, dueDate: string, group: Group): string {
    if (period) return period;

    const date = new Date(dueDate);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid dueDate. Use ISO date format (YYYY-MM-DD).');
    }

    const frequency = group.settings?.contributionFrequency ?? 'weekly';

    if (frequency === 'yearly') {
      return `${date.getUTCFullYear()}`;
    }

    if (frequency === 'monthly') {
      const year = date.getUTCFullYear();
      const monthIndex = date.getUTCMonth();
      return `${year}-${MONTH_LABELS[monthIndex]}`;
    }

    const { weekYear, week } = this.getIsoWeekYear(date);
    const baseWeek = `${weekYear}-W${`${week}`.padStart(2, '0')}`;

    if (frequency === 'twice_a_week' || frequency === 'thrice_a_week' || frequency === 'two') {
      return `${baseWeek}-1`; // Default to the first cycle of the week if auto-resolving
    }

    return baseWeek;
  }

  private getIsoWeekYear(date: Date): { weekYear: number; week: number } {
    const utcDate = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    const day = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
    const weekYear = utcDate.getUTCFullYear();
    const yearStart = new Date(Date.UTC(weekYear, 0, 1));
    const week = Math.ceil(((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return { weekYear, week };
  }

  private getIsoWeeksInYear(year: number): number {
    return this.getIsoWeekYear(new Date(Date.UTC(year, 11, 28))).week;
  }

  async getPeriod(actor: AuthUserType) {
    try {
      const groupId = this.requireActorGroupId(actor);
      const group = await this.groupRepository.findOne({ where: { id: groupId } });
      if (!group) throw new NotFoundException(`Group ${groupId} not found`);

      const frequency = group.settings?.contributionFrequency ?? 'weekly';
      const today = new Date();
      let period: string;
      let cycleNumber: number | undefined;

      period = this.resolvePeriod(undefined, today.toISOString().split('T')[0], group);

      const contribution = await this.contributionRepository.findOne({
        where: { groupId, period },
        relations: ['user', 'group'],
      });

      if (!contribution) {
        const generated = this.resolvePeriod(undefined, today.toISOString().split('T')[0], group);
        return {
          period: generated,
          cycleNumber: 1,
        };
      }

      return {
        period: contribution?.period,
        cycleNumber: contribution?.cycleNumber ? contribution.cycleNumber + 1 : 1,
      };
    } catch (error) {
      const { message } = error instanceof Error ? error : { message: 'Unknown error' };
      throw new BadRequestException(message, message);
    }
  }

  async getMyContributions(actor: AuthUserType): Promise<Contribution[]> {
    const userId = actor.sub;
    return this.contributionRepository.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }
}

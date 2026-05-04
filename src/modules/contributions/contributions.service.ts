/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
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
  PERIOD_MESSAGE,
  PERIOD_REGEX,
  RecordContributionDto,
  UpdateContributionDto,
  WaiveContributionDto,
} from './dto/contribution.dto';
import { generate } from 'rxjs';

/** Roles allowed to record / manage contributions (not members) */
const RECORDER_ROLES = [UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE, UserRole.SECRETARY];

@Injectable()
export class ContributionsService {
  constructor(
    private readonly contributionRepository: ContributionRepository,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
  ) {}

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
      status: dto.status ?? ContributionStatus.PAID,
      paidAmount:
        dto.paidAmount ??
        (dto.status === ContributionStatus.PAID || !dto.status ? resolvedAmount : undefined),
      settingsSnapshot: this.buildSettingsSnapshot(group),
      recordedById: actor.sub,
    });

    return this.contributionRepository.save(contribution);
  }

  async giveContribution(dto: RecordContributionDto, actor: AuthUserType): Promise<Contribution> {
    const groupId = this.requireActorGroupId(actor);
    const { userId, dueDate } = dto;
    if (!userId) {
      if (actor.role === UserRole.MEMBER) {
        dto.userId = actor.sub;
      }
    }
    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException(`Group ${groupId} not found`);
    const contribution = this.contributionRepository.create({
      ...dto,
      groupId,
      period: this.resolvePeriod(dto.period, dueDate, group),
    });
    try {
      const existing = await this.contributionRepository.findOne({
        where: { userId: dto.userId, groupId, period: contribution.period },
      });
      if (existing) {
        throw new BadRequestException(
          `A contribution record in period "${contribution.period}" already exists. Use PATCH to update it.`,
        );
      }
      return await this.contributionRepository.save(contribution);
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

  async findAll(
    filters: ContributionFilterDto,
    actor: AuthUserType,
  ): Promise<{ data: Contribution[]; total: number; page: number; limit: number }> {
    const scopedFilters = this.applyActorScope(filters, actor);
    const [data, total] = await this.contributionRepository.findWithFilters(scopedFilters);
    return {
      data,
      total,
      page: scopedFilters.page ?? 1,
      limit: scopedFilters.limit ?? 50,
    };
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
    return this.contributionRepository.getMemberSummary(userId, groupId);
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
    const monthlyPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

    if (frequency === 'weekly' && !weeklyPattern.test(period)) {
      throw new BadRequestException(
        `Period "${period}" is invalid for weekly group setting. Use format YYYY-Www (e.g. 2026-W18).`,
      );
    }

    if (frequency === 'monthly' && !monthlyPattern.test(period)) {
      throw new BadRequestException(
        `Period "${period}" is invalid for monthly group setting. Use format YYYY-MM (e.g. 2026-05).`,
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

    if (frequency === 'monthly') {
      const year = date.getUTCFullYear();
      const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
      return `${year}-${month}`;
    }

    const { weekYear, week } = this.getIsoWeekYear(date);
    return `${weekYear}-W${`${week}`.padStart(2, '0')}`;
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

  async getPeriod(actor: AuthUserType) {
    try {
      const groupId = this.requireActorGroupId(actor);
      const group = await this.groupRepository.findOne({ where: { id: groupId } });
      if (!group) throw new NotFoundException(`Group ${groupId} not found`);

      const frequency = group.settings?.contributionFrequency ?? 'weekly';
      const today = new Date();
      let period: string;

      if (frequency === 'weekly') {
        const { weekYear, week } = this.getIsoWeekYear(today);
        period = `${weekYear}-W${`${week}`.padStart(2, '0')}`;
      } else {
        const year = today.getUTCFullYear();
        const month = `${today.getUTCMonth() + 1}`.padStart(2, '0');
        period = `${year}-${month}`;
      }

      const contribution = await this.contributionRepository.findOne({
        where: { groupId, period },
        relations: ['user', 'group'],
      });

      if (!contribution) {
        const generated = this.resolvePeriod(undefined, today.toISOString().split('T')[0], group);
        return {
          period: generated,
        };
      }

      return { period: contribution?.period };
    } catch (error) {
      const { message } = error instanceof Error ? error : { message: 'Unknown error' };
      throw new BadRequestException(message, message);
    }
  }
}

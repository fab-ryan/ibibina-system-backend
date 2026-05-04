import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Contribution, ContributionStatus } from '../entities/contribution.entity';
import { ContributionFilterDto } from '../dto/contribution.dto';

export interface ContributionSummary {
  groupId: string;
  period: string | null;
  totalContributions: number;
  totalAmount: number;
  paidCount: number;
  pendingCount: number;
  lateCount: number;
  missedCount: number;
  waivedCount: number;
}

export interface MemberSummary {
  userId: string;
  totalContributions: number;
  totalAmountPaid: number;
  paidCount: number;
  pendingCount: number;
  lateCount: number;
  missedCount: number;
}

@Injectable()
export class ContributionRepository extends Repository<Contribution> {
  constructor(private readonly dataSource: DataSource) {
    super(Contribution, dataSource.createEntityManager());
  }

  async findWithFilters(filters: ContributionFilterDto = {}): Promise<[Contribution[], number]> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;

    const qb = this.createQueryBuilder('c')
      .leftJoinAndSelect('c.user', 'user')
      .leftJoinAndSelect('c.group', 'group')
      .orderBy('c.dueDate', 'DESC')
      .addOrderBy('c.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.groupId) qb.andWhere('c.groupId = :groupId', { groupId: filters.groupId });
    if (filters.userId) qb.andWhere('c.userId = :userId', { userId: filters.userId });
    if (filters.period) qb.andWhere('c.period = :period', { period: filters.period });
    if (filters.status) qb.andWhere('c.status = :status', { status: filters.status });
    if (filters.from) qb.andWhere('c.dueDate >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('c.dueDate <= :to', { to: filters.to });

    return qb.getManyAndCount();
  }

  async existsByUserGroupPeriod(userId: string, groupId: string, period: string): Promise<boolean> {
    return this.existsBy({ userId, groupId, period });
  }

  async getGroupSummary(groupId: string, period?: string): Promise<ContributionSummary> {
    const qb = this.createQueryBuilder('c')
      .select('c.groupId', 'groupId')
      .addSelect('c.period', 'period')
      .addSelect('COUNT(c.id)', 'totalContributions')
      .addSelect('COALESCE(SUM(c.amount), 0)', 'totalAmount')
      .addSelect(`COUNT(CASE WHEN c.status = '${ContributionStatus.PAID}' THEN 1 END)`, 'paidCount')
      .addSelect(
        `COUNT(CASE WHEN c.status = '${ContributionStatus.PENDING}' THEN 1 END)`,
        'pendingCount',
      )
      .addSelect(`COUNT(CASE WHEN c.status = '${ContributionStatus.LATE}' THEN 1 END)`, 'lateCount')
      .addSelect(
        `COUNT(CASE WHEN c.status = '${ContributionStatus.MISSED}' THEN 1 END)`,
        'missedCount',
      )
      .addSelect(
        `COUNT(CASE WHEN c.status = '${ContributionStatus.WAIVED}' THEN 1 END)`,
        'waivedCount',
      )
      .where('c.groupId = :groupId', { groupId })
      .groupBy('c.groupId')
      .addGroupBy('c.period');

    if (period) {
      qb.andWhere('c.period = :period', { period });
    }

    const rows = await qb.getRawMany<ContributionSummary>();

    if (rows.length === 0) {
      return {
        groupId,
        period: period ?? null,
        totalContributions: 0,
        totalAmount: 0,
        paidCount: 0,
        pendingCount: 0,
        lateCount: 0,
        missedCount: 0,
        waivedCount: 0,
      };
    }

    // Aggregate across periods when no specific period requested
    return rows.reduce<ContributionSummary>(
      (acc, row) => ({
        groupId,
        period: period ?? null,
        totalContributions: acc.totalContributions + Number(row.totalContributions),
        totalAmount: acc.totalAmount + Number(row.totalAmount),
        paidCount: acc.paidCount + Number(row.paidCount),
        pendingCount: acc.pendingCount + Number(row.pendingCount),
        lateCount: acc.lateCount + Number(row.lateCount),
        missedCount: acc.missedCount + Number(row.missedCount),
        waivedCount: acc.waivedCount + Number(row.waivedCount),
      }),
      {
        groupId,
        period: period ?? null,
        totalContributions: 0,
        totalAmount: 0,
        paidCount: 0,
        pendingCount: 0,
        lateCount: 0,
        missedCount: 0,
        waivedCount: 0,
      },
    );
  }

  async getMemberSummary(userId: string, groupId: string): Promise<MemberSummary> {
    const row = await this.createQueryBuilder('c')
      .select('c.userId', 'userId')
      .addSelect('COUNT(c.id)', 'totalContributions')
      .addSelect(
        `COALESCE(SUM(CASE WHEN c.status IN ('${ContributionStatus.PAID}','${ContributionStatus.LATE}') THEN c.amount ELSE 0 END), 0)`,
        'totalAmountPaid',
      )
      .addSelect(`COUNT(CASE WHEN c.status = '${ContributionStatus.PAID}' THEN 1 END)`, 'paidCount')
      .addSelect(
        `COUNT(CASE WHEN c.status = '${ContributionStatus.PENDING}' THEN 1 END)`,
        'pendingCount',
      )
      .addSelect(`COUNT(CASE WHEN c.status = '${ContributionStatus.LATE}' THEN 1 END)`, 'lateCount')
      .addSelect(
        `COUNT(CASE WHEN c.status = '${ContributionStatus.MISSED}' THEN 1 END)`,
        'missedCount',
      )
      .where('c.userId = :userId', { userId })
      .andWhere('c.groupId = :groupId', { groupId })
      .groupBy('c.userId')
      .getRawOne<MemberSummary>();

    if (!row) {
      return {
        userId,
        totalContributions: 0,
        totalAmountPaid: 0,
        paidCount: 0,
        pendingCount: 0,
        lateCount: 0,
        missedCount: 0,
      };
    }

    return {
      userId: row.userId,
      totalContributions: Number(row.totalContributions),
      totalAmountPaid: Number(row.totalAmountPaid),
      paidCount: Number(row.paidCount),
      pendingCount: Number(row.pendingCount),
      lateCount: Number(row.lateCount),
      missedCount: Number(row.missedCount),
    };
  }

  async markPeriodAsMissed(groupId: string, period: string): Promise<number> {
    const result = await this.createQueryBuilder()
      .update(Contribution)
      .set({ status: ContributionStatus.MISSED })
      .where('groupId = :groupId', { groupId })
      .andWhere('period = :period', { period })
      .andWhere('status = :status', { status: ContributionStatus.PENDING })
      .execute();

    return result.affected ?? 0;
  }
}

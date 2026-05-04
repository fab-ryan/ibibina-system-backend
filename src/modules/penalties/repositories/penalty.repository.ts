import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Penalty, PenaltyStatus } from '../entities/penalty.entity';
import { PenaltyFilterDto } from '../dto/penalty.dto';

export interface PenaltySummary {
  groupId: string;
  totalPenalties: number;
  totalAmount: number;
  pendingCount: number;
  pendingAmount: number;
  paidCount: number;
  paidAmount: number;
  waivedCount: number;
}

export interface MemberPenaltySummary {
  userId: string;
  totalPenalties: number;
  totalAmount: number;
  pendingAmount: number;
  paidAmount: number;
}

@Injectable()
export class PenaltyRepository extends Repository<Penalty> {
  constructor(private readonly dataSource: DataSource) {
    super(Penalty, dataSource.createEntityManager());
  }

  async findWithFilters(filters: PenaltyFilterDto = {}): Promise<[Penalty[], number]> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;

    const qb = this.createQueryBuilder('p')
      .leftJoinAndSelect('p.user', 'user')
      .leftJoinAndSelect('p.group', 'group')
      .orderBy('p.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.groupId) qb.andWhere('p.groupId = :groupId', { groupId: filters.groupId });
    if (filters.userId) qb.andWhere('p.userId = :userId', { userId: filters.userId });
    if (filters.contributionId) {
      qb.andWhere('p.contributionId = :contributionId', {
        contributionId: filters.contributionId,
      });
    }
    if (filters.status) qb.andWhere('p.status = :status', { status: filters.status });
    if (filters.reason) qb.andWhere('p.reason = :reason', { reason: filters.reason });
    if (filters.from) qb.andWhere('p.createdAt >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('p.createdAt <= :to', { to: filters.to });

    return qb.getManyAndCount();
  }

  async getGroupSummary(groupId: string): Promise<PenaltySummary> {
    const row = await this.createQueryBuilder('p')
      .select('p.groupId', 'groupId')
      .addSelect('COUNT(p.id)', 'totalPenalties')
      .addSelect('COALESCE(SUM(p.amount), 0)', 'totalAmount')
      .addSelect(
        `COUNT(CASE WHEN p.status = '${PenaltyStatus.PENDING}' THEN 1 END)`,
        'pendingCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN p.status = '${PenaltyStatus.PENDING}' THEN p.amount ELSE 0 END), 0)`,
        'pendingAmount',
      )
      .addSelect(`COUNT(CASE WHEN p.status = '${PenaltyStatus.PAID}' THEN 1 END)`, 'paidCount')
      .addSelect(
        `COALESCE(SUM(CASE WHEN p.status = '${PenaltyStatus.PAID}' THEN p.amount ELSE 0 END), 0)`,
        'paidAmount',
      )
      .addSelect(`COUNT(CASE WHEN p.status = '${PenaltyStatus.WAIVED}' THEN 1 END)`, 'waivedCount')
      .where('p.groupId = :groupId', { groupId })
      .groupBy('p.groupId')
      .getRawOne<PenaltySummary>();

    return {
      groupId,
      totalPenalties: Number(row?.totalPenalties ?? 0),
      totalAmount: Number(row?.totalAmount ?? 0),
      pendingCount: Number(row?.pendingCount ?? 0),
      pendingAmount: Number(row?.pendingAmount ?? 0),
      paidCount: Number(row?.paidCount ?? 0),
      paidAmount: Number(row?.paidAmount ?? 0),
      waivedCount: Number(row?.waivedCount ?? 0),
    };
  }

  async getMemberSummary(userId: string, groupId: string): Promise<MemberPenaltySummary> {
    const row = await this.createQueryBuilder('p')
      .select('p.userId', 'userId')
      .addSelect('COUNT(p.id)', 'totalPenalties')
      .addSelect('COALESCE(SUM(p.amount), 0)', 'totalAmount')
      .addSelect(
        `COALESCE(SUM(CASE WHEN p.status = '${PenaltyStatus.PENDING}' THEN p.amount ELSE 0 END), 0)`,
        'pendingAmount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN p.status = '${PenaltyStatus.PAID}' THEN p.amount ELSE 0 END), 0)`,
        'paidAmount',
      )
      .where('p.userId = :userId', { userId })
      .andWhere('p.groupId = :groupId', { groupId })
      .groupBy('p.userId')
      .getRawOne<MemberPenaltySummary>();

    return {
      userId,
      totalPenalties: Number(row?.totalPenalties ?? 0),
      totalAmount: Number(row?.totalAmount ?? 0),
      pendingAmount: Number(row?.pendingAmount ?? 0),
      paidAmount: Number(row?.paidAmount ?? 0),
    };
  }
}

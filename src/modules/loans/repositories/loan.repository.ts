import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Loan, LoanStatus } from '../entities/loan.entity';
import { LoanFilterDto } from '../dto/loan.dto';
import { PaginationHelper } from '@/utils/paginate';

export interface LoanGroupSummary {
  groupId: string;
  totalLoans: number;
  totalDisbursed: number;
  totalRepaid: number;
  pendingCount: number;
  activeCount: number;
  closedCount: number;
  defaultedCount: number;
}

@Injectable()
export class LoanRepository extends Repository<Loan> {
  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationHelper: PaginationHelper<Loan>,
  ) {
    super(Loan, dataSource.createEntityManager());
  }

  async findWithFilters(filters: LoanFilterDto & { userId?: string } = {}) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;

    const qb = this.createQueryBuilder('l')
      .leftJoinAndSelect('l.user', 'user')
      .orderBy('l.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.groupId) qb.andWhere('l.groupId = :groupId', { groupId: filters.groupId });
    if (filters.userId) qb.andWhere('l.userId = :userId', { userId: filters.userId });
    if (filters.status) qb.andWhere('l.status = :status', { status: filters.status });

    return await this.paginationHelper.run(qb);
  }

  async getGroupSummary(groupId: string): Promise<LoanGroupSummary> {
    const row = await this.createQueryBuilder('l')
      .select('l.groupId', 'groupId')
      .addSelect('COUNT(l.id)', 'totalLoans')
      .addSelect(
        `COALESCE(SUM(CASE WHEN l.status IN ('${LoanStatus.ACTIVE}','${LoanStatus.CLOSED}','${LoanStatus.DEFAULTED}') THEN l.disbursedAmount ELSE 0 END), 0)`,
        'totalDisbursed',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN l.status IN ('${LoanStatus.ACTIVE}','${LoanStatus.CLOSED}','${LoanStatus.DEFAULTED}') THEN (l.totalDue - COALESCE(l.remainingBalance, l.totalDue)) ELSE 0 END), 0)`,
        'totalRepaid',
      )
      .addSelect(`COUNT(CASE WHEN l.status = '${LoanStatus.PENDING}' THEN 1 END)`, 'pendingCount')
      .addSelect(`COUNT(CASE WHEN l.status = '${LoanStatus.ACTIVE}' THEN 1 END)`, 'activeCount')
      .addSelect(`COUNT(CASE WHEN l.status = '${LoanStatus.CLOSED}' THEN 1 END)`, 'closedCount')
      .addSelect(
        `COUNT(CASE WHEN l.status = '${LoanStatus.DEFAULTED}' THEN 1 END)`,
        'defaultedCount',
      )
      .where('l.groupId = :groupId', { groupId })
      .groupBy('l.groupId')
      .getRawOne<LoanGroupSummary>();

    if (!row) {
      return {
        groupId,
        totalLoans: 0,
        totalDisbursed: 0,
        totalRepaid: 0,
        pendingCount: 0,
        activeCount: 0,
        closedCount: 0,
        defaultedCount: 0,
      };
    }

    return {
      groupId: row.groupId,
      totalLoans: Number(row.totalLoans),
      totalDisbursed: Number(row.totalDisbursed),
      totalRepaid: Number(row.totalRepaid),
      pendingCount: Number(row.pendingCount),
      activeCount: Number(row.activeCount),
      closedCount: Number(row.closedCount),
      defaultedCount: Number(row.defaultedCount),
    };
  }
}

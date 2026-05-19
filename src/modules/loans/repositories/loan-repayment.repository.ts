import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { LoanRepayment, RepaymentStatus } from '../entities/loan-repayment.entity';
import { RepaymentFilterDto } from '../dto/loan.dto';
import { PaginateResult, PaginationHelper } from '@/utils';

@Injectable()
export class LoanRepaymentRepository extends Repository<LoanRepayment> {
  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationHelper: PaginationHelper<LoanRepayment>,
  ) {
    super(LoanRepayment, dataSource.createEntityManager());
  }

  async findByLoan(
    loanId: string,
    filters: RepaymentFilterDto = {},
  ): Promise<PaginateResult<LoanRepayment>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 100;

    const qb = this.createQueryBuilder('r')
      .where('r.loanId = :loanId', { loanId })
      .orderBy('r.installmentNumber', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.status) qb.andWhere('r.status = :status', { status: filters.status });

    return this.paginationHelper.paginate(qb, page, limit);
  }

  async getTotalPaidForLoan(loanId: string): Promise<number> {
    const row = await this.createQueryBuilder('r')
      .select(`COALESCE(SUM(r.amountPaid), 0)`, 'totalPaid')
      .where('r.loanId = :loanId', { loanId })
      .andWhere(`r.status IN (:...statuses)`, {
        statuses: [RepaymentStatus.PAID, RepaymentStatus.PARTIAL],
      })
      .getRawOne<{ totalPaid: string }>();

    return Number(row?.totalPaid ?? 0);
  }

  async getNextPendingInstallment(loanId: string): Promise<LoanRepayment | null> {
    return this.findOne({
      where: { loanId, status: RepaymentStatus.PENDING },
      order: { installmentNumber: 'ASC' },
    });
  }
}

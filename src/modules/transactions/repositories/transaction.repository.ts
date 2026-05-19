import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Transaction } from '../entities/transaction.entity';
import { TransactionFilterDto } from '../dto/transaction.dto';

@Injectable()
export class TransactionRepository extends Repository<Transaction> {
  constructor(private readonly dataSource: DataSource) {
    super(Transaction, dataSource.createEntityManager());
  }

  async findWithFilters(
    filters: TransactionFilterDto & { groupId?: string },
  ): Promise<[Transaction[], number]> {
    const qb = this.createQueryBuilder('tx')
      .leftJoinAndSelect('tx.user', 'user')
      .orderBy('tx.createdAt', 'DESC');

    if (filters.type) qb.andWhere('tx.type = :type', { type: filters.type });
    if (filters.userId) qb.andWhere('tx.userId = :userId', { userId: filters.userId });
    if (filters.groupId) qb.andWhere('tx.groupId = :groupId', { groupId: filters.groupId });
    if (filters.status) qb.andWhere('tx.status = :status', { status: filters.status });

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    qb.skip((page - 1) * limit).take(limit);

    return qb.getManyAndCount();
  }
}

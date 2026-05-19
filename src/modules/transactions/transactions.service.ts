import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUserType } from '@/common/middlewares/authenticate.middleware';
import { UserRole } from '@/modules/users/enums/user-role.enum';
import { Transaction, TransactionStatus } from './entities/transaction.entity';
import { TransactionRepository } from './repositories/transaction.repository';
import { CreateTransactionData, TransactionFilterDto } from './dto/transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly transactionRepository: TransactionRepository) {}

  // ─── Internal: create a transaction record ──────────────────────────────────

  async create(data: CreateTransactionData): Promise<Transaction> {
    const tx = this.transactionRepository.create({
      ...data,
      status: data.status ?? TransactionStatus.COMPLETED,
      paidAt: data.paidAt ?? new Date(),
    });
    return this.transactionRepository.save(tx);
  }

  // ─── List with filters ──────────────────────────────────────────────────────

  async findAll(
    filters: TransactionFilterDto,
    actor: AuthUserType,
  ): Promise<{ data: Transaction[]; total: number; page: number; limit: number }> {
    const scoped = this.applyActorScope(filters, actor);
    const [data, total] = await this.transactionRepository.findWithFilters(scoped);
    return { data, total, page: scoped.page ?? 1, limit: scoped.limit ?? 50 };
  }

  // ─── Single ─────────────────────────────────────────────────────────────────

  async findOne(id: string, actor: AuthUserType): Promise<Transaction> {
    const tx = await this.transactionRepository.findOne({
      where: { id },
      relations: ['user', 'group'],
    });
    if (!tx) throw new NotFoundException(`Transaction ${id} not found`);

    // Members can only see their own transactions
    if (actor.role === UserRole.MEMBER.toString() && tx.userId !== actor.sub) {
      throw new NotFoundException(`Transaction ${id} not found`);
    }

    return tx;
  }

  // ─── By reference (contribution or penalty id) ───────────────────────────────

  async findByReference(referenceId: string): Promise<Transaction[]> {
    return this.transactionRepository.find({
      where: { referenceId },
      order: { createdAt: 'DESC' },
    });
  }

  // ─── Scope filters to actor ─────────────────────────────────────────────────

  private applyActorScope(
    filters: TransactionFilterDto,
    actor: AuthUserType,
  ): TransactionFilterDto & { groupId?: string } {
    const scoped = { ...filters };

    if (actor.role === UserRole.MEMBER.toString()) {
      // Members only see their own transactions
      (scoped as any).userId = actor.sub;
    } else if (actor.groupId) {
      // Staff see their group's transactions (unless admin overrides groupId)
      if (!scoped.groupId) {
        (scoped as any).groupId = actor.groupId;
      }
    }

    return scoped as TransactionFilterDto & { groupId?: string };
  }
}

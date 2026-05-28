/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import * as path from 'path';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUserType } from '@/common/middlewares/authenticate.middleware';
import { UserRole } from '@/modules/users/enums/user-role.enum';
import { Transaction, TransactionStatus } from './entities/transaction.entity';
import { TransactionRepository } from './repositories/transaction.repository';
import { CreateTransactionData, TransactionFilterDto } from './dto/transaction.dto';
import { PaymentService } from '@/common/services/payment.service';
import { PaymentMethod } from '@/enums';
import {
  Contribution,
  ContributionStatus,
} from '@/modules/contributions/entities/contribution.entity';
import { Penalty, PenaltyStatus } from '@/modules/penalties/entities/penalty.entity';
import { TransactionType } from './entities/transaction.entity';
import { PaginateResult } from '@/utils/paginate';

// ─── Paypack webhook payload shape ─────────────────────────────────────────────
interface PaypackWebhookPayload {
  ref: string;
  kind: string;
  status?: 'successful' | 'failed' | string;
  amount?: number;
  client?: string;
  timestamp?: string;
}

@Injectable()
export class TransactionsService {
  constructor(
    private readonly transactionRepository: TransactionRepository,
    private readonly paymentService: PaymentService,
    @InjectRepository(Contribution)
    private readonly contributionRepository: Repository<Contribution>,
    @InjectRepository(Penalty)
    private readonly penaltyRepository: Repository<Penalty>,
  ) {}

  // ─── Internal: create a transaction record ──────────────────────────────────

  async create(data: CreateTransactionData): Promise<Transaction> {
    let momoRef: string | undefined = data.momoRef;
    let status = data.status ?? TransactionStatus.COMPLETED;

    if (data.paymentMethod === PaymentMethod.MOMO) {
      // MoMo: initiate payment via Paypack, save as PENDING (webhook confirms later)
      const result = await this.paymentService.initiatePayment({
        paidAmount: data.amount,
        phoneNumber: data.phoneNumber ?? '',
      });
      momoRef = result.ref;
      status = TransactionStatus.PENDING;
    }

    const tx = this.transactionRepository.create({
      ...data,
      momoRef,
      referenceFileUrl: data.referenceFileUrl,
      status,
      paidAt: data.paidAt ?? new Date(),
    });
    return this.transactionRepository.save(tx);
  }

  // ─── Upload a bank reference file ───────────────────────────────────────────

  uploadReference(file: Express.Multer.File): { fileUrl: string } {
    const filename = path.basename(file.filename);
    return { fileUrl: `/uploads/references/${filename}` };
  }

  // ─── Handle Paypack webhook ─────────────────────────────────────────────────

  async handlePaypackWebhook(payload: PaypackWebhookPayload): Promise<void> {
    if (!payload.ref) return;

    const tx = await this.transactionRepository.findByMomoRef(payload.ref);
    if (!tx) return; // unknown ref — ignore silently

    if (payload.status === 'successful') {
      tx.status = TransactionStatus.COMPLETED;
      await this.transactionRepository.save(tx);

      // Mark the related contribution as PAID or PARTIAL (if not yet fully paid)
      if (tx.type === TransactionType.CONTRIBUTION) {
        const contribution = await this.contributionRepository.findOne({
          where: { id: tx.referenceId },
        });
        if (
          contribution &&
          contribution.status !== ContributionStatus.PAID &&
          contribution.status !== ContributionStatus.WAIVED
        ) {
          const newTotal = Number(contribution.paidAmount ?? 0) + Number(tx.amount);
          contribution.paidAmount = newTotal;
          contribution.status =
            newTotal >= Number(contribution.amount)
              ? ContributionStatus.PAID
              : ContributionStatus.PARTIAL;
          await this.contributionRepository.save(contribution);
        }
      }

      // Mark the related penalty as PAID (if still pending)
      if (tx.type === TransactionType.PENALTY) {
        const penalty = await this.penaltyRepository.findOne({
          where: { id: tx.referenceId },
        });
        if (penalty && penalty.status === PenaltyStatus.PENDING) {
          penalty.status = PenaltyStatus.PAID;
          penalty.paidAt = new Date();
          await this.penaltyRepository.save(penalty);
        }
      }
    } else if (payload.status === 'failed') {
      tx.status = TransactionStatus.FAILED;
      await this.transactionRepository.save(tx);
    }
  }

  // ─── List with filters ──────────────────────────────────────────────────────

  async findAll(
    filters: TransactionFilterDto,
    actor: AuthUserType,
  ): Promise<PaginateResult<Transaction>> {
    const scoped = this.applyActorScope(filters, actor);
    const result = await this.transactionRepository.findWithFilters(scoped);
    return result;
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

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThan, Repository } from 'typeorm';
import { LoanRepayment, RepaymentStatus } from './entities/loan-repayment.entity';
import { Loan, LoanStatus } from './entities/loan.entity';

@Injectable()
export class LoanSchedulerService {
  private readonly logger = new Logger(LoanSchedulerService.name);

  constructor(
    @InjectRepository(LoanRepayment)
    private readonly repaymentRepository: Repository<LoanRepayment>,
    @InjectRepository(Loan)
    private readonly loanRepository: Repository<Loan>,
  ) {}

  /**
   * Runs every day at midnight.
   * Finds all PENDING installments whose dueDate has passed and marks them MISSED.
   */
  @Cron(CronExpression.EVERY_12_HOURS)
  async markOverdueInstallments(): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    this.logger.log('Running overdue installment check...');

    try {
      const overdueInstallments = await this.repaymentRepository.find({
        where: {
          status: RepaymentStatus.PENDING,
          dueDate: LessThan(today.toISOString().split('T')[0]),
        },
      });

      if (overdueInstallments.length === 0) {
        this.logger.log('No overdue installments found.');
        return;
      }

      for (const installment of overdueInstallments) {
        installment.status = RepaymentStatus.MISSED;
        installment.notes = installment.notes
          ? `${installment.notes} | Auto-marked missed on ${today.toISOString().split('T')[0]}`
          : `Auto-marked missed on ${today.toISOString().split('T')[0]}`;
      }

      await this.repaymentRepository.save(overdueInstallments);

      this.logger.log(`Marked ${overdueInstallments.length} installment(s) as MISSED.`);
    } catch (error) {
      this.logger.error('Error marking overdue installments', error);
    }
  }

  /**
   * Runs every day at 01:00.
   * Finds ACTIVE loans where every remaining (non-paid) installment is MISSED
   * and marks the loan as DEFAULTED.
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async markDefaultedLoans(): Promise<void> {
    this.logger.log('Running defaulted loan check...');

    try {
      const activeLoans = await this.loanRepository.find({
        where: { status: LoanStatus.ACTIVE },
      });

      let defaultedCount = 0;

      for (const loan of activeLoans) {
        const installments = await this.repaymentRepository.find({
          where: { loanId: loan.id },
        });

        if (installments.length === 0) continue;

        const hasPendingOrPaid = installments.some(
          (i) =>
            i.status === RepaymentStatus.PENDING ||
            i.status === RepaymentStatus.PAID ||
            i.status === RepaymentStatus.PARTIAL,
        );

        if (!hasPendingOrPaid) {
          // All installments are MISSED — mark loan as DEFAULTED
          loan.status = LoanStatus.DEFAULTED;
          await this.loanRepository.save(loan);
          defaultedCount++;

          this.logger.warn(`Loan ${loan.id} marked as DEFAULTED (all installments missed).`);
        }
      }

      this.logger.log(
        `Defaulted loan check complete. ${defaultedCount} loan(s) marked as DEFAULTED.`,
      );
    } catch (error) {
      this.logger.error('Error marking defaulted loans', error);
    }
  }
}

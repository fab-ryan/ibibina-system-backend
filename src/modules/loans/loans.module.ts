import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '@/common/common.module';
import { User } from '@/modules/users/entities/user.entity';
import { Group } from '@/modules/groups/entities/group.entity';
import { Contribution } from '@/modules/contributions/entities/contribution.entity';
import { TransactionsModule } from '@/modules/transactions/transactions.module';
import { Loan } from './entities/loan.entity';
import { LoanRepayment } from './entities/loan-repayment.entity';
import { LoanRepository } from './repositories/loan.repository';
import { LoanRepaymentRepository } from './repositories/loan-repayment.repository';
import { LoansService } from './loans.service';
import { LoansController } from './loans.controller';
import { LoanSchedulerService } from './loans.scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([Loan, LoanRepayment, User, Group, Contribution]),
    CommonModule,
    TransactionsModule,
  ],
  controllers: [LoansController],
  providers: [LoanRepository, LoanRepaymentRepository, LoansService, LoanSchedulerService],
  exports: [LoansService, LoanRepository, LoanRepaymentRepository],
})
export class LoansModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@/modules/users/entities/user.entity';
import { Group } from '@/modules/groups/entities/group.entity';
import { Contribution } from '@/modules/contributions/entities/contribution.entity';
import { Loan } from '@/modules/loans/entities/loan.entity';
import { LoanRepayment } from '@/modules/loans/entities/loan-repayment.entity';
import { Penalty } from '@/modules/penalties/entities/penalty.entity';
import { Transaction } from '@/modules/transactions/entities/transaction.entity';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Group,
      Contribution,
      Loan,
      LoanRepayment,
      Penalty,
      Transaction,
    ]),
  ],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}

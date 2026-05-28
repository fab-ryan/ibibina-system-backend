import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '@/common/common.module';
import { User } from '@/modules/users/entities/user.entity';
import { Group } from '@/modules/groups/entities/group.entity';
import { Contribution } from '@/modules/contributions/entities/contribution.entity';
import { Loan } from '@/modules/loans/entities/loan.entity';
import { LoanRepayment } from '@/modules/loans/entities/loan-repayment.entity';
import { Penalty } from '@/modules/penalties/entities/penalty.entity';
import { Transaction } from '@/modules/transactions/entities/transaction.entity';
import { Report } from './entities/report.entity';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Report,
      Group,
      User,
      Contribution,
      Loan,
      LoanRepayment,
      Penalty,
      Transaction,
    ]),
    CommonModule,
  ],
  providers: [ReportsService],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}

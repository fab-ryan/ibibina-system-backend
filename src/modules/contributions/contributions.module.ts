import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contribution } from './entities/contribution.entity';
import { User } from '@/modules/users/entities/user.entity';
import { Group } from '@/modules/groups/entities/group.entity';
import { ContributionRepository } from './repositories/contribution.repository';
import { ContributionsService } from './contributions.service';
import { ContributionsController } from './contributions.controller';
import { TransactionsModule } from '@/modules/transactions/transactions.module';
import { ActivitiesModule } from '../activities/activities.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contribution, User, Group]),
    TransactionsModule,
    ActivitiesModule,
  ],
  controllers: [ContributionsController],
  providers: [ContributionRepository, ContributionsService],
  exports: [ContributionRepository, ContributionsService],
})
export class ContributionsModule {}

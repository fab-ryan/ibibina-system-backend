import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contribution } from './entities/contribution.entity';
import { User } from '@/modules/users/entities/user.entity';
import { Group } from '@/modules/groups/entities/group.entity';
import { ContributionRepository } from './repositories/contribution.repository';
import { ContributionsService } from './contributions.service';
import { ContributionsController } from './contributions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Contribution, User, Group])],
  controllers: [ContributionsController],
  providers: [ContributionRepository, ContributionsService],
  exports: [ContributionRepository, ContributionsService],
})
export class ContributionsModule {}

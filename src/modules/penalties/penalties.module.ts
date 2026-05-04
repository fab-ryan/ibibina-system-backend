import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Penalty } from './entities/penalty.entity';
import { User } from '@/modules/users/entities/user.entity';
import { Group } from '@/modules/groups/entities/group.entity';
import { PenaltyRepository } from './repositories/penalty.repository';
import { PenaltiesService } from './penalties.service';
import { PenaltiesController } from './penalties.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Penalty, User, Group])],
  controllers: [PenaltiesController],
  providers: [PenaltyRepository, PenaltiesService],
  exports: [PenaltyRepository, PenaltiesService],
})
export class PenaltiesModule {}

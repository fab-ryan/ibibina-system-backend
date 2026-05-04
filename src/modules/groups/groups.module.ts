import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Group } from './entities/group.entity';
import { User } from '../users/entities/user.entity';
import { GroupRepository } from './repositories/group.repository';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Group, User])],
  controllers: [GroupsController],
  providers: [GroupRepository, GroupsService],
  exports: [GroupRepository, GroupsService],
})
export class GroupsModule {}

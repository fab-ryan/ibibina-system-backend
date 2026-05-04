import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserRepository } from './repositories';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { GroupsModule } from '../groups/groups.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), GroupsModule],
  controllers: [UsersController],
  providers: [UserRepository, UsersService],
  exports: [UsersService, UserRepository],
})
export class UsersModule {}

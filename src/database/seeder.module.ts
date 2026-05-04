import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../modules/users/users.module';
import { GroupsModule } from '../modules/groups/groups.module';
import { UserSeeder } from '../modules/users/users.seeder';
import { User } from '../modules/users/entities/user.entity';
import { UserRepository } from '@/modules/users/repositories';
import { Group } from '@/modules/groups/entities/group.entity';
import { GroupRepository } from '@/modules/groups/repositories';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.development.local', '.env.development', '.env'],
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'user',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_DATABASE || 'ibibina',
      entities: [User, Group],
      synchronize: process.env.DB_SYNCHRONIZE === 'true',
      logging: false,
    }),
    TypeOrmModule.forFeature([User, Group]),
    GroupsModule,
  ],
  providers: [UserSeeder, UserRepository, GroupRepository],
})
export class SeederModule {}

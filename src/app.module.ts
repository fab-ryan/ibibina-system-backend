import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CommonModule } from './common';
import { SetupModule } from './modules/setup/setup.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { MailModule } from './modules/mail/mail.module';
import { User } from './modules/users/entities/user.entity';
import { Group } from './modules/groups/entities/group.entity';
import { GroupsModule } from './modules/groups/groups.module';
import { Contribution } from './modules/contributions/entities/contribution.entity';
import { ContributionsModule } from './modules/contributions/contributions.module';
import { Penalty } from './modules/penalties/entities/penalty.entity';
import { PenaltiesModule } from './modules/penalties/penalties.module';
import { Activity } from './modules/activities/entities/activity.entity';
import { ActivitiesModule } from './modules/activities/activities.module';

@Module({
  imports: [
    CommonModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME', 'user'),
        password: configService.get<string>('DB_PASSWORD', 'password'),
        database: configService.get<string>('DB_DATABASE', 'ibibina'),
        synchronize: configService.get<string>('DB_SYNCHRONIZE') === 'true',
        logging: configService.get<string>('DB_LOGGING') === 'true',
        entities: [User, Group, Contribution, Penalty, Activity],
        autoLoadEntities: true,
      }),
    }),
    MailModule,
    SetupModule,
    UsersModule,
    GroupsModule,
    ContributionsModule,
    PenaltiesModule,
    ActivitiesModule,
    AuthModule,
  ],
})
export class AppModule {}

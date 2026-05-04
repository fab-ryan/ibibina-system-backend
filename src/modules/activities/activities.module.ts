import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Activity } from './entities/activity.entity';
import { ActivityRepository } from './repositories/activity.repository';
import { ActivitiesService } from './activities.service';
import { ActivitiesController } from './activities.controller';
import { ActivityInterceptor } from './interceptors/activity.interceptor';

@Module({
  imports: [TypeOrmModule.forFeature([Activity])],
  providers: [
    ActivityRepository,
    ActivitiesService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ActivityInterceptor,
    },
  ],
  controllers: [ActivitiesController],
  exports: [ActivitiesService, ActivityRepository],
})
export class ActivitiesModule {}

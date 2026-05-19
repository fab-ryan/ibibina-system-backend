import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AuthUserType } from '@/common/middlewares/authenticate.middleware';
import { UserRole } from '@/modules/users/enums/user-role.enum';
import { ActivityRepository } from './repositories/activity.repository';
import { ActivityFilterDto } from './dto/activity.dto';
import { Activity } from './entities/activity.entity';
import { PaginationHelper } from '@/utils';

export interface CreateActivityInput {
  type: string;
  action: string;
  method: string;
  path: string;
  actorId?: string;
  actorRole?: string;
  actorGroupId?: string;
  groupId?: string;
  amount?: number;
  currency?: string;
  status?: string;
  resourceType?: string;
  resourceId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger(ActivitiesService.name);

  constructor(private readonly activityRepository: ActivityRepository) {}

  async recordActivity(input: CreateActivityInput): Promise<void> {
    try {
      const activity = this.activityRepository.create(input);
      await this.activityRepository.save(activity);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown activity logging error';
      this.logger.error(`Failed to save activity log: ${message}`);
    }
  }

  async findAll(filters: ActivityFilterDto, actor: AuthUserType) {
    const scopedFilters = this.applyActorScope(filters, actor);
    const result = await this.activityRepository.findWithFilters(scopedFilters);
    return result;
  }

  async findMine(filters: ActivityFilterDto, actor: AuthUserType) {
    const scoped = { ...filters, actorId: actor.sub };

    return this.findAll(scoped, actor);
  }

  private applyActorScope(filters: ActivityFilterDto, actor: AuthUserType): ActivityFilterDto {
    const scoped = { ...filters };

    if (actor.role === UserRole.ADMIN.toString()) {
      return scoped;
    }

    if (!actor.groupId) {
      throw new BadRequestException('Authenticated user is not linked to a group');
    }

    // Members can only read their own activities.
    if (actor.role === UserRole.MEMBER.toString()) {
      scoped.actorId = actor.sub;
      scoped.groupId = actor.groupId;
      return scoped;
    }

    // Group leaders can read activities in their own group.
    scoped.groupId = actor.groupId;
    return scoped;
  }

  async logContributionActivity(
    contribution: {
      id: string;
      groupId?: string;
      userId?: string;
      amount?: number;
      currency?: string;
      status?: string;
    },
    actor: AuthUserType,
  ) {
    try {
      await this.recordActivity({
        type: 'contribution',
        action: 'create',
        method: 'POST',
        path: `/contributions/${contribution.id}`,
        actorId: actor.sub,
        actorRole: actor.role,
        actorGroupId: actor.groupId,
        groupId: contribution.groupId,
        amount: contribution.amount,
        currency: contribution.currency,
        status: contribution.status,
        resourceType: 'contribution',
        resourceId: contribution.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to log contribution activity: ${message}`);
    }
  }
}

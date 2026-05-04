import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AuthUserType } from '@/common/middlewares/authenticate.middleware';
import { UserRole } from '@/modules/users/enums/user-role.enum';
import { ActivityRepository } from './repositories/activity.repository';
import { ActivityFilterDto } from './dto/activity.dto';
import { Activity } from './entities/activity.entity';

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

  async findAll(
    filters: ActivityFilterDto,
    actor: AuthUserType,
  ): Promise<{ data: Activity[]; total: number; page: number; limit: number }> {
    const scopedFilters = this.applyActorScope(filters, actor);
    const [data, total] = await this.activityRepository.findWithFilters(scopedFilters);

    return {
      data,
      total,
      page: scopedFilters.page ?? 1,
      limit: scopedFilters.limit ?? 50,
    };
  }

  async findMine(
    filters: ActivityFilterDto,
    actor: AuthUserType,
  ): Promise<{ data: Activity[]; total: number; page: number; limit: number }> {
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
}

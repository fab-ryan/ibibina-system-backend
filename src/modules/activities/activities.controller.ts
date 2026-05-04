import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, CurrentUser } from '@/common/decorators';
import * as authenticateMiddleware from '@/common/middlewares/authenticate.middleware';
import { UserRole } from '@/modules/users/enums/user-role.enum';
import { ActivitiesService } from './activities.service';
import { ActivityFilterDto } from './dto/activity.dto';

@ApiTags('Activities')
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.SECRETARY, UserRole.FINANCE, UserRole.MEMBER)
  @ApiOperation({ summary: 'List saved activity history with filters' })
  async findAll(
    @Query() filters: ActivityFilterDto,
    @CurrentUser() actor: authenticateMiddleware.AuthUserType,
  ) {
    return this.activitiesService.findAll(filters, actor);
  }

  @Get('me')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.SECRETARY, UserRole.FINANCE, UserRole.MEMBER)
  @ApiOperation({ summary: 'List saved activity history for current user' })
  async findMine(
    @Query() filters: ActivityFilterDto,
    @CurrentUser() actor: authenticateMiddleware.AuthUserType,
  ) {
    return this.activitiesService.findMine(filters, actor);
  }
}

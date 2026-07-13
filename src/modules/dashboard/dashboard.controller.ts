import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, CurrentUser } from '@/common/decorators';
import * as authenticateMiddleware from '@/common/middlewares/authenticate.middleware';
import { UserRole } from '@/modules/users/enums/user-role.enum';
import { DashboardService } from './dashboard.service';
import {
  DashboardQueryDto,
  LoanOverviewQueryDto,
  ContributionOverviewQueryDto,
  FinanceOverviewQueryDto,
  AdminOverviewResponse,
} from './dto/dashboard.dto';
import { ResponseService } from '@/common/services/response.service';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly responseService: ResponseService,
  ) {}

  @Get('member/overview')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.SECRETARY, UserRole.FINANCE, UserRole.MEMBER)
  @ApiOperation({
    summary: 'Dashboard overview: total savings, total members, next meeting, joining date',
  })
  async getOverview(
    @CurrentUser() actor: authenticateMiddleware.AuthUserType,
    @Query() query: DashboardQueryDto,
  ) {
    const overview = await this.dashboardService.getOverview(actor, query.groupId);
    return this.responseService.response({
      success: true,
      data: overview,
      message: 'Dashboard overview retrieved successfully',
    });
  }

  @Get('staff/overview')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE)
  @ApiOperation({
    summary: 'Staff dashboard: group info, stats, recent activity and alerts',
  })
  async getStaffOverview(
    @CurrentUser() actor: authenticateMiddleware.AuthUserType,
    @Query() query: DashboardQueryDto,
  ) {
    const overview = await this.dashboardService.getStaffOverview(actor, query.groupId);
    return this.responseService.response({
      success: true,
      data: overview,
      message: 'Staff dashboard overview retrieved successfully',
    });
  }

  @Get('staff/loans')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE)
  @ApiOperation({
    summary: 'Loan overview: summary stats, loan list with overdue detection, member filter list',
  })
  async getLoanOverview(
    @CurrentUser() actor: authenticateMiddleware.AuthUserType,
    @Query() query: LoanOverviewQueryDto,
  ) {
    const overview = await this.dashboardService.getLoanOverview(actor, query);
    return this.responseService.response({
      success: true,
      data: overview,
      message: 'Loan overview retrieved successfully',
    });
  }

  @Get('staff/contributions')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE)
  @ApiOperation({
    summary:
      'Contribution overview: 12-month member heatmap, total collected, monthly target, pending penalties',
  })
  async getContributionOverview(
    @CurrentUser() actor: authenticateMiddleware.AuthUserType,
    @Query() query: ContributionOverviewQueryDto,
  ) {
    const overview = await this.dashboardService.getContributionOverview(actor, query);
    return this.responseService.response({
      success: true,
      data: overview,
      message: 'Contribution overview retrieved successfully',
    });
  }

  @Get('staff/finance')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE)
  @ApiOperation({
    summary: 'Finance overview: summary stats + monthly breakdown chart for the year',
  })
  async getFinanceOverview(
    @CurrentUser() actor: authenticateMiddleware.AuthUserType,
    @Query() query: FinanceOverviewQueryDto,
  ) {
    const overview = await this.dashboardService.getFinanceOverview(actor, query);
    return this.responseService.response({
      success: true,
      data: overview,
      message: 'Finance overview retrieved successfully',
    });
  }

  @Get('admin/overview')
  @Auth(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Admin dashboard overview stats',
  })
  async getAdminOverview(
    @CurrentUser() actor: authenticateMiddleware.AuthUserType,
  ) {
    const overview = await this.dashboardService.getAdminOverview(actor);
    return this.responseService.response({
      success: true,
      data: overview,
      message: 'Admin dashboard overview retrieved successfully',
    });
  }
}

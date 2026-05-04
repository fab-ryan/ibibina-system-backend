/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Auth, CurrentUser } from '@/common/decorators';
import { UserRole } from '@/modules/users/enums/user-role.enum';
import type { AuthUserType } from '@/common/middlewares/authenticate.middleware';
import { ContributionsService } from './contributions.service';
import {
  BulkRecordContributionDto,
  ContributionFilterDto,
  GeneratePeriodContributionsDto,
  RecordContributionDto,
  UpdateContributionDto,
  WaiveContributionDto,
} from './dto/contribution.dto';
import { BadRequestException } from '@/core/exceptions/app.exception';
import { ResponseService } from '@/common/services/response.service';

@ApiTags('Contributions')
@Controller('contributions')
export class ContributionsController {
  constructor(
    private readonly contributionsService: ContributionsService,
    private readonly responseService: ResponseService,
  ) {}

  // ─── Record single contribution ────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE, UserRole.SECRETARY)
  @ApiOperation({ summary: 'Record a single member contribution' })
  async record(@Body() dto: RecordContributionDto, @CurrentUser() actor: AuthUserType) {
    let userId = dto.userId;
    if (!userId) {
      if (actor.role === UserRole.MEMBER) {
        userId = actor.sub;
      } else {
        throw new BadRequestException('userId is required for non-member roles');
      }
    }
    return this.contributionsService.record({ ...dto, userId }, actor);
  }
  @Post('give')
  @HttpCode(HttpStatus.CREATED)
  @Auth(UserRole.MEMBER)
  @ApiOperation({ summary: 'Give your contribution (members only, auto-assigns userId)' })
  async give(@Body() dto: RecordContributionDto, @CurrentUser() actor: AuthUserType) {
    const contribution = await this.contributionsService.giveContribution(dto, actor);
    return this.responseService.response({
      success: true,
      statusCode: HttpStatus.CREATED,
      message: 'Contribution recorded successfully',
      data: contribution,
    });
  }

  // ─── Bulk record (paid members for same period) ────────────────────────────

  @Post('bulk')
  @HttpCode(HttpStatus.CREATED)
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE, UserRole.SECRETARY)
  @ApiOperation({ summary: 'Record contributions for multiple members in one period' })
  async bulkRecord(@Body() dto: BulkRecordContributionDto, @CurrentUser() actor: AuthUserType) {
    return this.contributionsService.bulkRecord(dto, actor);
  }

  // ─── Generate PENDING placeholders for a cycle ────────────────────────────

  @Post('generate-period')
  @HttpCode(HttpStatus.CREATED)
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE)
  @ApiOperation({
    summary: 'Generate PENDING contribution records for all group members in a cycle',
  })
  async generatePeriod(
    @Body() dto: GeneratePeriodContributionsDto,
    @CurrentUser() actor: AuthUserType,
  ) {
    return this.contributionsService.generatePeriodContributions(dto, actor);
  }

  // ─── Mark whole period as missed ──────────────────────────────────────────

  @Patch('groups/:groupId/periods/:period/mark-missed')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE)
  @ApiOperation({
    summary: 'Mark all PENDING contributions for a period as MISSED',
  })
  @ApiParam({ name: 'groupId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'period', example: '2026-W18' })
  async markPeriodMissed(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('period') period: string,
    @CurrentUser() actor: AuthUserType,
  ) {
    return this.contributionsService.markPeriodMissed(groupId, period, actor);
  }

  // ─── Group summary ────────────────────────────────────────────────────────

  @Get('summary/group/:groupId')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE, UserRole.SECRETARY)
  @ApiOperation({ summary: 'Get aggregated contribution stats for a group' })
  @ApiParam({ name: 'groupId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'period', required: false, description: 'Filter by period e.g. 2026-W18' })
  async getGroupSummary(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query('period') period: string | undefined,
    @CurrentUser() actor: AuthUserType,
  ) {
    return this.contributionsService.getGroupSummary(groupId, period, actor);
  }

  // ─── Member summary ───────────────────────────────────────────────────────

  @Get('summary/member/:userId')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE, UserRole.SECRETARY, UserRole.MEMBER)
  @ApiOperation({ summary: 'Get contribution summary for a single member' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'groupId', required: true, description: 'Group UUID' })
  async getMemberSummary(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('groupId') groupId: string,
    @CurrentUser() actor: AuthUserType,
  ) {
    return this.contributionsService.getMemberSummary(userId, groupId, actor);
  }

  // ─── List with filters ────────────────────────────────────────────────────

  @Get()
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE, UserRole.SECRETARY, UserRole.MEMBER)
  @ApiOperation({ summary: 'List contributions with optional filters' })
  async findAll(@Query() filters: ContributionFilterDto, @CurrentUser() actor: AuthUserType) {
    return this.contributionsService.findAll(filters, actor);
  }

  // ------ Get Period Contribution (for auto-generating period from dueDate) ────────────────────────────

  @Get('period-contribution')
  @Auth(UserRole.MEMBER, UserRole.CHAIRPERSON, UserRole.FINANCE)
  @ApiOperation({
    summary:
      'Get contribution record for a group + period (used for auto-generating period from dueDate)',
  })
  //   @ApiQuery({ name: 'groupId', required: true, description: 'Group UUID' })
  //   @ApiQuery({
  //     name: 'dueDate',
  //     required: true,
  //     description: 'Due date to infer the period from (YYYY-MM-DD)',
  //   })
  async getPeriodContribution(@CurrentUser() actor: AuthUserType) {
    const contribution = await this.contributionsService.getPeriod(actor);
    return this.responseService.response({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Period contribution retrieved successfully',
      data: contribution,
    });
  }
  // ─── Get single ───────────────────────────────────────────────────────────

  @Get(':id')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE, UserRole.SECRETARY, UserRole.MEMBER)
  @ApiOperation({ summary: 'Get a single contribution by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUserType) {
    return this.contributionsService.findOne(id, actor);
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  @Patch(':id')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE, UserRole.SECRETARY)
  @ApiOperation({ summary: 'Update / correct a contribution record' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContributionDto,
    @CurrentUser() actor: AuthUserType,
  ) {
    return this.contributionsService.update(id, dto, actor);
  }

  // ─── Waive ────────────────────────────────────────────────────────────────

  @Patch(':id/waive')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON)
  @ApiOperation({ summary: 'Waive a contribution (chairperson / admin)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async waive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WaiveContributionDto,
    @CurrentUser() actor: AuthUserType,
  ) {
    return this.contributionsService.waive(id, dto, actor);
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete a contribution record (admin only)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUserType) {
    await this.contributionsService.remove(id, actor);
  }
}

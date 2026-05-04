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
import { PenaltiesService } from './penalties.service';
import {
  IssuePenaltyDto,
  PenaltyFilterDto,
  SettlePenaltyDto,
  UpdatePenaltyDto,
  WaivePenaltyDto,
} from './dto/penalty.dto';

@ApiTags('Penalties')
@Controller('penalties')
export class PenaltiesController {
  constructor(private readonly penaltiesService: PenaltiesService) {}

  // ─── Issue a penalty ────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE)
  @ApiOperation({ summary: 'Issue a penalty to a group member' })
  async issue(@Body() dto: IssuePenaltyDto, @CurrentUser() actor: AuthUserType) {
    return this.penaltiesService.issue(dto, actor);
  }

  // ─── Group summary ───────────────────────────────────────────────────────────

  @Get('summary/group/:groupId')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE, UserRole.SECRETARY)
  @ApiOperation({ summary: 'Get aggregated penalty stats for a group' })
  @ApiParam({ name: 'groupId', type: 'string', format: 'uuid' })
  async getGroupSummary(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() actor: AuthUserType,
  ) {
    return this.penaltiesService.getGroupSummary(groupId, actor);
  }

  // ─── Member summary ──────────────────────────────────────────────────────────

  @Get('summary/member/:userId')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE, UserRole.SECRETARY, UserRole.MEMBER)
  @ApiOperation({ summary: 'Get penalty summary for a single member' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'groupId', required: true })
  async getMemberSummary(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('groupId') groupId: string,
    @CurrentUser() actor: AuthUserType,
  ) {
    return this.penaltiesService.getMemberSummary(userId, groupId, actor);
  }

  // ─── List with filters ───────────────────────────────────────────────────────

  @Get()
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE, UserRole.SECRETARY, UserRole.MEMBER)
  @ApiOperation({ summary: 'List penalties with optional filters' })
  async findAll(@Query() filters: PenaltyFilterDto, @CurrentUser() actor: AuthUserType) {
    return this.penaltiesService.findAll(filters, actor);
  }

  // ─── Single ──────────────────────────────────────────────────────────────────

  @Get(':id')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE, UserRole.SECRETARY, UserRole.MEMBER)
  @ApiOperation({ summary: 'Get a single penalty by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUserType) {
    return this.penaltiesService.findOne(id, actor);
  }

  // ─── Update ──────────────────────────────────────────────────────────────────

  @Patch(':id')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE)
  @ApiOperation({ summary: 'Update a penalty record' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePenaltyDto,
    @CurrentUser() actor: AuthUserType,
  ) {
    return this.penaltiesService.update(id, dto, actor);
  }

  // ─── Settle ───────────────────────────────────────────────────────────────────

  @Patch(':id/settle')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE)
  @ApiOperation({ summary: 'Record payment of a penalty' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async settle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SettlePenaltyDto,
    @CurrentUser() actor: AuthUserType,
  ) {
    return this.penaltiesService.settle(id, dto, actor);
  }

  // ─── Waive ────────────────────────────────────────────────────────────────────

  @Patch(':id/waive')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON)
  @ApiOperation({ summary: 'Waive a penalty (chairperson / admin)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async waive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WaivePenaltyDto,
    @CurrentUser() actor: AuthUserType,
  ) {
    return this.penaltiesService.waive(id, dto, actor);
  }

  // ─── Delete ───────────────────────────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete a penalty record (admin only)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUserType) {
    await this.penaltiesService.remove(id, actor);
  }
}

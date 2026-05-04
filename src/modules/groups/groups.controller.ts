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
import { GroupsService } from './groups.service';
import {
  AssignChairpersonDto,
  AssignGroupRoleDto,
  BatchAssignGroupRolesDto,
  BulkAssignGroupRoleDto,
  CreateGroupDto,
  GroupFilterDto,
  UpdateGroupDto,
  UpdateGroupSettingsDto,
} from './dto/group.dto';
import { Auth, CurrentUser } from '@/common/decorators';
import { UserRole } from '@/modules/users/enums/user-role.enum';
import type { AuthUserType } from '@/common/middlewares/authenticate.middleware';

@ApiTags('Groups')
@Controller('groups')
@Auth(UserRole.ADMIN, UserRole?.CHAIRPERSON)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new savings group (admin only)' })
  async create(@Body() dto: CreateGroupDto) {
    const group = await this.groupsService.create(dto);
    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      message: 'Group created successfully',
      data: group,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List groups (admin only)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  async findAll(@Query() filters: GroupFilterDto) {
    const groups = await this.groupsService.findAll(filters);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Groups retrieved successfully',
      data: groups,
    };
  }
  @Get('generate-code')
  @ApiOperation({ summary: 'Generate a unique group code (admin only)' })
  async generateUniqueGroupCode() {
    const code = await this.groupsService.generateUniqueCodes();
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Unique group code generated successfully',
      data: { groupe_code: code },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a group by id (admin only)' })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const group = await this.groupsService.findOne(id);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Group retrieved successfully',
      data: group,
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update group details (admin only)' })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGroupDto) {
    const group = await this.groupsService.update(id, dto);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Group updated successfully',
      data: group,
    };
  }

  @Patch(':id/settings')
  @ApiOperation({ summary: 'Update group settings (admin only)' })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  async updateSettings(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGroupSettingsDto,
  ) {
    const group = await this.groupsService.updateSettings(id, dto);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Group settings updated successfully',
      data: group,
    };
  }

  @Patch(':id/assign-chairperson')
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Assign or replace group chairperson (admin only)' })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  async assignChairperson(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignChairpersonDto,
    @CurrentUser() currentUser: AuthUserType,
  ) {
    const user = await this.groupsService.assignRole(
      id,
      { userId: dto.userId, role: UserRole.CHAIRPERSON },
      currentUser,
    );

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Chairperson assigned successfully',
      data: user,
    };
  }

  @Patch(':id/assign-role')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON)
  @ApiOperation({ summary: 'Assign any non-admin group role (admin/chairperson)' })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  async assignRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignGroupRoleDto,
    @CurrentUser() currentUser: AuthUserType,
  ) {
    const user = await this.groupsService.assignRole(id, dto, currentUser);

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: `Assigned role '${dto.role}' successfully`,
      data: user,
    };
  }

  @Get(':id/members')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON)
  @ApiOperation({ summary: 'List all group members grouped by role (admin/chairperson)' })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  async getGroupMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthUserType,
  ) {
    const members = await this.groupsService.getGroupMembers(id, currentUser);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Group members retrieved successfully',
      data: members,
    };
  }

  @Patch(':id/assign-roles/bulk')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON)
  @ApiOperation({
    summary: 'Assign multiple users to the same role in one request (admin/chairperson)',
    description:
      'Roles chairperson/secretary/finance only accept a single userId. ' +
      'Returns separate succeeded/failed lists so partial failures are visible.',
  })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  async bulkAssignRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BulkAssignGroupRoleDto,
    @CurrentUser() currentUser: AuthUserType,
  ) {
    const result = await this.groupsService.bulkAssignRole(id, dto, currentUser);
    const allFailed = result.succeeded.length === 0 && result.failed.length > 0;
    return {
      success: !allFailed,
      statusCode: HttpStatus.OK,
      message: allFailed
        ? 'All assignments failed'
        : `${result.succeeded.length} user(s) assigned, ${result.failed.length} failed`,
      data: result,
    };
  }

  @Patch(':id/assign-roles/batch')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON)
  @ApiOperation({
    summary: 'Assign multiple users each with a different role in one request (admin/chairperson)',
    description:
      'Each entry in the assignments array is independent. ' +
      'Returns separate succeeded/failed lists so partial failures are visible.',
  })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  async batchAssignRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BatchAssignGroupRolesDto,
    @CurrentUser() currentUser: AuthUserType,
  ) {
    const result = await this.groupsService.batchAssignRoles(id, dto, currentUser);
    const allFailed = result.succeeded.length === 0 && result.failed.length > 0;
    return {
      success: !allFailed,
      statusCode: HttpStatus.OK,
      message: allFailed
        ? 'All assignments failed'
        : `${result.succeeded.length} user(s) assigned, ${result.failed.length} failed`,
      data: result,
    };
  }

  @Get(':id/roles/health')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON)
  @ApiOperation({ summary: 'Get required-role health for a group' })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  async getRoleHealth(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthUserType,
  ) {
    const health = await this.groupsService.getRoleHealth(id, currentUser);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Group role health retrieved successfully',
      data: health,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a group (admin only)' })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.groupsService.remove(id);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Group deleted successfully',
    };
  }
}

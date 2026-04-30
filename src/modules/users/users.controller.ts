/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import {
  CreateUserDto,
  UpdateUserDto,
  ChangePasswordDto,
  ChangePinDto,
  UserFilterDto,
} from './dto';
import { UserRole, UserStatus } from './enums/user-role.enum';
import { Auth, CurrentUser } from '@/common/decorators';
import type { AuthUserType } from '@/common/middlewares/authenticate.middleware';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** Admin creates any user (including other admins, chairpersons, etc.) */
  @Post()
  @Auth(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new user (admin only)' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'User created successfully' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Email or phone already exists' })
  async create(@Body() dto: CreateUserDto) {
    const user = await this.usersService.create(dto);
    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      message: 'User created successfully',
      data: user,
    };
  }

  /** Admin lists all users */
  @Get()
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'List all users with optional filters (admin only)' })
  @ApiQuery({ name: 'role', enum: UserRole, required: false })
  @ApiQuery({ name: 'status', enum: UserStatus, required: false })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name, email or phone' })
  async findAll(@Query() filters: UserFilterDto) {
    const users = await this.usersService.findAll(filters);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Users retrieved successfully',
      data: users,
    };
  }

  @Get('stats/roles')
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get user count grouped by role (admin only)' })
  async countByRole() {
    const counts = await this.usersService.countByRole();
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Role statistics retrieved',
      data: counts,
    };
  }

  @Get('role/:role')
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all users by role (admin only)' })
  @ApiParam({ name: 'role', enum: UserRole })
  async findByRole(@Param('role') role: UserRole) {
    const users = await this.usersService.findByRole(role);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: `${role} users retrieved successfully`,
      data: users,
    };
  }

  /** Any authenticated user can view a profile */
  @Get(':id')
  @Auth()
  @ApiOperation({ summary: 'Get a user by ID (authenticated)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.usersService.findOne(id);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'User retrieved successfully',
      data: user,
    };
  }

  /** Any authenticated user can update their own profile */
  @Patch(':id')
  @Auth()
  @ApiOperation({ summary: 'Update a user (authenticated)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: AuthUserType,
  ) {
    // Non-admins can only update themselves
    if (currentUser.role !== UserRole.ADMIN && currentUser.sub !== id) {
      return {
        success: false,
        statusCode: HttpStatus.FORBIDDEN,
        message: 'You can only update your own profile',
      };
    }
    const user = await this.usersService.update(id, dto);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'User updated successfully',
      data: user,
    };
  }

  /** Admin changes their own password */
  @Patch(':id/password')
  @Auth(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password — admin role only' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  async changePassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangePasswordDto,
    @CurrentUser() currentUser: AuthUserType,
  ) {
    if (currentUser.sub !== id) {
      return {
        success: false,
        statusCode: HttpStatus.FORBIDDEN,
        message: 'You can only change your own password',
      };
    }
    await this.usersService.changePassword(id, dto);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Password changed successfully',
    };
  }

  /** Non-admin users change their own PIN */
  @Patch(':id/pin')
  @Auth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change PIN — non-admin roles only' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  async changePin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangePinDto,
    @CurrentUser() currentUser: AuthUserType,
  ) {
    if (currentUser.sub !== id) {
      return {
        success: false,
        statusCode: HttpStatus.FORBIDDEN,
        message: 'You can only change your own PIN',
      };
    }
    await this.usersService.changePin(id, dto);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'PIN changed successfully',
    };
  }

  @Patch(':id/status')
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update user status (admin only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiQuery({ name: 'status', enum: UserStatus })
  async updateStatus(@Param('id', ParseUUIDPipe) id: string, @Query('status') status: UserStatus) {
    const user = await this.usersService.updateStatus(id, status);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: `User status updated to '${status}'`,
      data: user,
    };
  }

  @Delete(':id')
  @Auth(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a user (admin only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.usersService.remove(id);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'User deleted successfully',
    };
  }
}

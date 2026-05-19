import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User, ADMIN_ROLES } from './entities/user.entity';
import {
  CreateUserDto,
  UpdateUserDto,
  ChangePasswordDto,
  ChangePinDto,
  LoginDto,
  UserFilterDto,
} from './dto';
import { UserRole, UserStatus } from './enums/user-role.enum';
import { UserRepository } from './repositories';
import { GroupRepository } from '@/modules/groups/repositories';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
} from '@/core/exceptions';
import type { AuthUserType } from '@/common/middlewares/authenticate.middleware';
import { PaginationHelper } from '@/utils';
import { MailService } from '@/modules/mail/mail.service';
import { Group } from '@/modules/groups/entities/group.entity';
import { SmsService } from '@/modules/sms/sms.service';

const REQUIRED_GROUP_ROLES: UserRole[] = [
  UserRole.CHAIRPERSON,
  UserRole.SECRETARY,
  UserRole.FINANCE,
  UserRole.MEMBER,
];

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly groupRepository: GroupRepository,
    private readonly mailService: MailService,
    private readonly smsService: SmsService,
    private readonly configService: ConfigService,
  ) {}

  async create(dto: CreateUserDto, actor?: AuthUserType): Promise<User> {
    const role = dto.role ?? UserRole.MEMBER;
    const payload: CreateUserDto = { ...dto, role };
    let targetGroup: Group | null = null;

    if (actor?.role === UserRole.CHAIRPERSON) {
      if (role === UserRole.ADMIN || role === UserRole.CHAIRPERSON) {
        throw new BadRequestException(
          'Chairperson can only add secretary, finance, or member users',
        );
      }

      if (!actor.groupId) {
        throw new BadRequestException('Chairperson must belong to a group');
      }

      if (payload.groupId && payload.groupId !== actor.groupId) {
        throw new BadRequestException('Chairperson can only add users to their own group');
      }

      payload.groupId = actor.groupId;
    }

    const isAdmin = ADMIN_ROLES.includes(role);

    if (isAdmin) {
      if (!payload.email || !payload.password) {
        throw new BadRequestException('Admin users require email and password');
      }
      if (await this.userRepository.existsByEmail(payload.email)) {
        throw new ConflictException(`User with email '${payload.email}' already exists`);
      }
    } else {
      if (!payload.phone) {
        throw new BadRequestException('Non-admin users require phone and password');
      }
      if (await this.userRepository.existsByPhone(payload.phone)) {
        throw new ConflictException(`User with phone '${payload.phone}' already exists`);
      }

      if (payload.groupId) {
        targetGroup = await this.groupRepository.findOne({ where: { id: payload.groupId } });
        if (!targetGroup) {
          throw new NotFoundException(`Group with id '${payload.groupId}' not found`);
        }
      }

      if (role !== UserRole.CHAIRPERSON && payload.groupId) {
        const hasChairperson = await this.userRepository.existsActiveByGroupAndRole(
          payload.groupId,
          UserRole.CHAIRPERSON,
        );
        if (!hasChairperson) {
          throw new BadRequestException(
            'A group must have an active chairperson before adding other roles',
          );
        }
      }
    }

    // PIN is stored in the password column for non-admin users
    const { ...rest } = payload;
    const userPassword = isAdmin ? payload.password : this.generatePin();
    const user = this.userRepository.create({
      ...rest,
      role,
      password: userPassword,
    });

    await this.userRepository.save(user);
    if (!isAdmin && payload.phone && userPassword) {
      await this.sendPinSmsIfNeeded(payload.phone, userPassword, targetGroup);
    }
    await this.sendGroupJoinEmailIfNeeded(user, targetGroup, userPassword);
    return user;
  }

  async findAll(filters: UserFilterDto = {}) {
    try {
      return this.userRepository.findWithFilters(filters);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to retrieve users with filters ${JSON.stringify(filters)}: ${message}`,
      );
      throw new BadRequestException('Failed to retrieve users with the provided filters', error);
    }
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User with id '${id}' not found`);
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email);
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.userRepository.findByPhone(phone);
  }

  async findByIdentifier(identifier: string): Promise<User | null> {
    return this.userRepository.findByIdentifier(identifier);
  }

  async findByRole(role: UserRole): Promise<User[]> {
    return this.userRepository.findByRole(role);
  }

  async validateCredentials(dto: LoginDto): Promise<User> {
    const user = await this.userRepository.findByIdentifier(dto.identifier);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    // Both admin (password) and non-admin (PIN) are stored in the password column
    const valid = await user.comparePassword(dto.credential);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(`Account is ${user.status}`);
    }

    // Admin: email must be verified (checked once at login; JWT carries access after that)
    if (user.isAdmin && !user.isEmailVerified) {
      throw new UnauthorizedException('Email address has not been verified');
    }

    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    await this.assertRequiredRoleCoverageOnMutation(user, dto);
    const previousGroupId = user.groupId;
    let targetGroup: Group | null = null;

    if (dto.groupId) {
      targetGroup = await this.groupRepository.findOne({ where: { id: dto.groupId } });
      if (!targetGroup) {
        throw new NotFoundException(`Group with id '${dto.groupId}' not found`);
      }
    }

    if (dto.email && dto.email !== user.email) {
      if (await this.userRepository.existsByEmail(dto.email)) {
        throw new ConflictException(`Email '${dto.email}' is already taken`);
      }
    }
    if (dto.phone && dto.phone !== user.phone) {
      if (await this.userRepository.existsByPhone(dto.phone)) {
        throw new ConflictException(`Phone '${dto.phone}' is already taken`);
      }
    }
    Object.assign(user, dto);
    const savedUser = await this.userRepository.save(user);

    if (dto.groupId && dto.groupId !== previousGroupId) {
      await this.sendGroupJoinEmailIfNeeded(savedUser, targetGroup, 'null');
    }

    return savedUser;
  }

  async changePassword(id: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.findOne(id);
    if (!ADMIN_ROLES.includes(user.role)) {
      throw new BadRequestException('Password change is only available for admin users');
    }
    const valid = await user.comparePassword(dto.currentPassword);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must differ from the current password');
    }
    user.password = dto.newPassword;
    await this.userRepository.save(user);
  }

  async changePin(id: string, dto: ChangePinDto): Promise<void> {
    const user = await this.findOne(id);
    if (ADMIN_ROLES.includes(user.role)) {
      throw new BadRequestException('PIN change is only available for non-admin users');
    }
    // PIN is stored in the password column
    const valid = await user.comparePassword(dto.currentPin);
    if (!valid) throw new UnauthorizedException('Current PIN is incorrect');
    if (dto.currentPin === dto.newPin) {
      throw new BadRequestException('New PIN must differ from the current PIN');
    }
    user.password = dto.newPin;
    await this.userRepository.save(user);
    if (user.phone) {
      await this.sendPinChangedSmsIfNeeded(user.phone, dto.newPin);
    }
  }

  async updateStatus(id: string, status: UserStatus): Promise<User> {
    const user = await this.findOne(id);
    await this.assertRequiredRoleCoverageOnStatusChange(user, status);
    return this.userRepository.updateStatus(user, status);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.assertRequiredRoleCoverageOnRemoval(user);
    await this.userRepository.remove(user);
  }

  async countByRole(): Promise<Record<UserRole, number>> {
    return this.userRepository.countByRole();
  }

  private async assertRequiredRoleCoverageOnRemoval(user: User): Promise<void> {
    await this.assertRoleCoverageAfterPotentialRemoval(user, {
      nextGroupId: undefined,
      nextRole: undefined,
      nextStatus: UserStatus.INACTIVE,
    });
  }

  private async assertRequiredRoleCoverageOnStatusChange(
    user: User,
    nextStatus: UserStatus,
  ): Promise<void> {
    await this.assertRoleCoverageAfterPotentialRemoval(user, {
      nextGroupId: user.groupId,
      nextRole: user.role,
      nextStatus,
    });
  }

  private async assertRequiredRoleCoverageOnMutation(
    user: User,
    dto: UpdateUserDto,
  ): Promise<void> {
    await this.assertRoleCoverageAfterPotentialRemoval(user, {
      nextGroupId: dto.groupId ?? user.groupId,
      nextRole: dto.role ?? user.role,
      nextStatus: dto.status ?? user.status,
    });
  }

  private async assertRoleCoverageAfterPotentialRemoval(
    user: User,
    next: {
      nextGroupId?: string;
      nextRole?: UserRole;
      nextStatus: UserStatus;
    },
  ): Promise<void> {
    const sourceGroupId = user.groupId;
    if (!sourceGroupId) return;

    if (!REQUIRED_GROUP_ROLES.includes(user.role) || user.status !== UserStatus.ACTIVE) {
      return;
    }

    const remainsInSameGroup = next.nextGroupId === sourceGroupId;
    const remainsSameRole = next.nextRole === user.role;
    const remainsActive = next.nextStatus === UserStatus.ACTIVE;

    if (remainsInSameGroup && remainsSameRole && remainsActive) {
      return;
    }

    const remainingCount = await this.userRepository.countActiveByGroupAndRole(
      sourceGroupId,
      user.role,
      user.id,
    );

    if (remainingCount < 1) {
      throw new BadRequestException(`Each group must always have at least one active ${user.role}`);
    }
  }

  async usersStatistics() {
    return this.userRepository.usersStatistics();
  }

  generatePin(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async sendGroupJoinEmailIfNeeded(
    user: User,
    group: Group | null,
    userPassword?: string,
  ): Promise<void> {
    if (!user.email || !group) {
      return;
    }

    const mobileAppUrl = this.configService.get<string>(
      'sms.mobileAppUrl',
      'http://localhost:3000',
    );

    try {
      await this.mailService.sendGroupWelcome({
        to: user.email,
        name: user.fullName,
        groupName: group.name,
        role: user.role,
        phone: user.phone,
        mobileAppUrl,
        password: userPassword,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send group join email to ${user.email}: ${message}`);
    }
  }

  private async sendPinSmsIfNeeded(phone: string, pin: string, group: Group | null): Promise<void> {
    try {
      await this.smsService.sendMemberPin(phone, pin, group?.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send PIN SMS to ${phone}: ${message}`);
    }
  }

  private async sendPinChangedSmsIfNeeded(phone: string, pin: string): Promise<void> {
    try {
      await this.smsService.sendPinChanged(phone, pin);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send PIN change SMS to ${phone}: ${message}`);
    }
  }

  private async generateUserCode(groupId: string): Promise<string> {
    const count = await this.userRepository.countBy({ groupId });
    return `U${groupId.slice(0, 4).toUpperCase()}${(count + 1).toString().padStart(4, '0')}`;
  }
}

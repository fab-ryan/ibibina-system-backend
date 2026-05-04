import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GroupRepository } from './repositories/group.repository';
import { Group, DEFAULT_GROUP_SETTINGS } from './entities/group.entity';
import {
  AssignGroupRoleDto,
  BatchAssignGroupRolesDto,
  BulkAssignGroupRoleDto,
  CreateGroupDto,
  GroupFilterDto,
  UpdateGroupDto,
  UpdateGroupSettingsDto,
} from './dto/group.dto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@/core/exceptions';
import { User } from '@/modules/users/entities/user.entity';
import { UserRole, UserStatus } from '@/modules/users/enums/user-role.enum';
import type { AuthUserType } from '@/common/middlewares/authenticate.middleware';

const GROUP_REQUIRED_ROLES: UserRole[] = [
  UserRole.CHAIRPERSON,
  UserRole.SECRETARY,
  UserRole.FINANCE,
  UserRole.MEMBER,
];

const SINGLE_OWNER_ROLES: UserRole[] = [UserRole.CHAIRPERSON, UserRole.SECRETARY, UserRole.FINANCE];

@Injectable()
export class GroupsService {
  constructor(
    private readonly groupRepository: GroupRepository,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(dto: CreateGroupDto): Promise<Group> {
    const name = dto.name.trim();

    if (await this.groupRepository.existsByName(name)) {
      throw new ConflictException(`Group '${name}' already exists`);
    }

    const group = this.groupRepository.create({
      ...dto,
      name,
      settings: { ...DEFAULT_GROUP_SETTINGS, ...dto.settings },
      groupe_code: await this.generateUniqueGroupCode(),
    });

    return this.groupRepository.save(group);
  }

  async findAll(filters: GroupFilterDto = {}): Promise<Group[]> {
    return this.groupRepository.findWithFilters(filters);
  }

  async findOne(id: string): Promise<Group> {
    const group = await this.groupRepository.findOne({ where: { id } });
    if (!group) {
      throw new NotFoundException(`Group with id '${id}' not found`);
    }
    return group;
  }

  async update(id: string, dto: UpdateGroupDto): Promise<Group> {
    const group = await this.findOne(id);

    if (
      dto.name &&
      dto.name !== group.name &&
      (await this.groupRepository.existsByName(dto.name))
    ) {
      throw new ConflictException(`Group '${dto.name}' already exists`);
    }

    const mergedSettings = dto.settings
      ? { ...DEFAULT_GROUP_SETTINGS, ...group.settings, ...dto.settings }
      : group.settings;

    Object.assign(group, { ...dto, settings: mergedSettings });
    return this.groupRepository.save(group);
  }

  async updateSettings(id: string, dto: UpdateGroupSettingsDto): Promise<Group> {
    const group = await this.findOne(id);
    group.settings = { ...DEFAULT_GROUP_SETTINGS, ...group.settings, ...dto.settings };
    return this.groupRepository.save(group);
  }

  async remove(id: string): Promise<void> {
    const group = await this.findOne(id);
    await this.groupRepository.remove(group);
  }

  async assignRole(groupId: string, dto: AssignGroupRoleDto, actor: AuthUserType): Promise<User> {
    const group = await this.findOne(groupId);
    const user = await this.userRepository.findOne({ where: { id: dto.userId } });

    if (!user) {
      throw new NotFoundException(`User with id '${dto.userId}' not found`);
    }

    if (dto.role === UserRole.ADMIN) {
      throw new BadRequestException('Admin role cannot be assigned through group role assignment');
    }

    if (actor.role === UserRole.CHAIRPERSON.toString()) {
      if (!actor.groupId || actor.groupId !== group.id) {
        throw new ForbiddenException('Chairperson can only assign roles inside their own group');
      }

      if (dto.role === UserRole.CHAIRPERSON) {
        throw new ForbiddenException('Chairperson cannot assign another chairperson');
      }
    }

    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException('Admin users cannot be reassigned into group roles');
    }

    if (!user.phone) {
      throw new BadRequestException('User must have a phone number to be assigned to a group role');
    }

    if (SINGLE_OWNER_ROLES.includes(dto.role)) {
      const roleOwner = await this.userRepository.findOne({
        where: { groupId: group.id, role: dto.role, status: UserStatus.ACTIVE },
      });

      if (roleOwner && roleOwner.id !== user.id) {
        throw new ConflictException(
          `Group already has an active ${dto.role}. Reassign or demote them first.`,
        );
      }
    }

    user.groupId = group.id;
    user.role = dto.role;
    if (user.status !== UserStatus.ACTIVE) {
      user.status = UserStatus.ACTIVE;
    }

    return this.userRepository.save(user);
  }

  // ─── Bulk: assign many users to the same role ──────────────────────────────

  async bulkAssignRole(
    groupId: string,
    dto: BulkAssignGroupRoleDto,
    actor: AuthUserType,
  ): Promise<{ succeeded: User[]; failed: { userId: string; reason: string }[] }> {
    if (SINGLE_OWNER_ROLES.includes(dto.role) && dto.userIds.length > 1) {
      throw new BadRequestException(
        `Role '${dto.role}' may only have one holder per group. Provide a single userId.`,
      );
    }

    const succeeded: User[] = [];
    const failed: { userId: string; reason: string }[] = [];

    for (const userId of dto.userIds) {
      try {
        const user = await this.assignRole(groupId, { userId, role: dto.role }, actor);
        succeeded.push(user);
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : String(err);
        failed.push({ userId, reason });
      }
    }

    return { succeeded, failed };
  }

  // ─── Batch: many users each with a different role ────────────────────────────

  async batchAssignRoles(
    groupId: string,
    dto: BatchAssignGroupRolesDto,
    actor: AuthUserType,
  ): Promise<{ succeeded: User[]; failed: { userId: string; role: UserRole; reason: string }[] }> {
    const succeeded: User[] = [];
    const failed: { userId: string; role: UserRole; reason: string }[] = [];

    for (const entry of dto.assignments) {
      try {
        const user = await this.assignRole(groupId, entry, actor);
        succeeded.push(user);
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : String(err);
        failed.push({ userId: entry.userId, role: entry.role, reason });
      }
    }

    return { succeeded, failed };
  }

  // ─── List group members grouped by role ─────────────────────────────────────

  async getGroupMembers(groupId: string, actor: AuthUserType): Promise<Record<UserRole, User[]>> {
    const group = await this.findOne(groupId);

    if (actor.role === UserRole.CHAIRPERSON.toString() && actor.groupId !== group.id) {
      throw new ForbiddenException('Chairperson can only view members of their own group');
    }

    const members = await this.userRepository.find({ where: { groupId: group.id } });

    const grouped: Record<UserRole, User[]> = {
      [UserRole.ADMIN]: [],
      [UserRole.CHAIRPERSON]: [],
      [UserRole.SECRETARY]: [],
      [UserRole.FINANCE]: [],
      [UserRole.MEMBER]: [],
    };

    for (const member of members) {
      grouped[member.role]?.push(member);
    }

    return grouped;
  }

  async getRoleHealth(
    groupId: string,
    actor: AuthUserType,
  ): Promise<{
    groupId: string;
    counts: Record<UserRole, number>;
    missingRoles: UserRole[];
    isHealthy: boolean;
  }> {
    const group = await this.findOne(groupId);

    if (actor.role === UserRole.CHAIRPERSON.toString() && actor.groupId !== group.id) {
      throw new ForbiddenException('Chairperson can only view role health of their own group');
    }

    const counts: Record<UserRole, number> = {
      [UserRole.ADMIN]: 0,
      [UserRole.CHAIRPERSON]: 0,
      [UserRole.SECRETARY]: 0,
      [UserRole.FINANCE]: 0,
      [UserRole.MEMBER]: 0,
    };

    for (const role of GROUP_REQUIRED_ROLES) {
      counts[role] = await this.userRepository.count({
        where: { groupId: group.id, role, status: UserStatus.ACTIVE },
      });
    }

    const missingRoles = GROUP_REQUIRED_ROLES.filter((role) => counts[role] < 1);

    return {
      groupId: group.id,
      counts,
      missingRoles,
      isHealthy: missingRoles.length === 0,
    };
  }

  async generateUniqueGroupCode(): Promise<string> {
    const INITIALS = 'ISG';
    const YEAR = new Date().getFullYear().toString();
    const MAX_ATTEMPTS = 5;

    const currentGroupCount = await this.groupRepository.count();
    const baseNumber = currentGroupCount + 1;
    const baseCode = `${INITIALS}-${YEAR}-${baseNumber.toString().padStart(4, '0')}`;
    if (!(await this.groupRepository.existsByGroupeCode(baseCode))) {
      return baseCode;
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const randomSuffix = Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, '0');
      const candidateCode = `${INITIALS}-${YEAR}-${baseNumber.toString().padStart(4, '0')}-${randomSuffix}`;
      if (!(await this.groupRepository.existsByGroupeCode(candidateCode))) {
        return candidateCode;
      }
    }
    return `${INITIALS}-${YEAR}-${baseNumber.toString().padStart(4, '0')}}`;
  }

  async generateUniqueCodes(): Promise<string> {
    const allGroups = await this.groupRepository.find();
    for (const group of allGroups) {
      if (!group.groupe_code) {
        group.groupe_code = await this.generateUniqueGroupCode();
        await this.groupRepository.save(group);
        return `Generated code for group '${group.name}': ${group.groupe_code}`;
      }
    }
    return 'Unique codes generated for all groups';
  }
}

import { Injectable } from '@nestjs/common';
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
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
} from '@/core/exceptions';

@Injectable()
export class UsersService {
  constructor(private readonly userRepository: UserRepository) {}

  async create(dto: CreateUserDto): Promise<User> {
    const role = dto.role ?? UserRole.MEMBER;
    const isAdmin = ADMIN_ROLES.includes(role);

    if (isAdmin) {
      if (!dto.email || !dto.password) {
        throw new BadRequestException('Admin users require email and password');
      }
      if (await this.userRepository.existsByEmail(dto.email)) {
        throw new ConflictException(`User with email '${dto.email}' already exists`);
      }
    } else {
      if (!dto.phone || !dto.pin) {
        throw new BadRequestException('Non-admin users require phone and PIN');
      }
      if (await this.userRepository.existsByPhone(dto.phone)) {
        throw new ConflictException(`User with phone '${dto.phone}' already exists`);
      }
    }

    // PIN is stored in the password column for non-admin users
    const { pin, ...rest } = dto;
    const user = this.userRepository.create({
      ...rest,
      role,
      password: isAdmin ? dto.password : pin,
    });
    return this.userRepository.save(user);
  }

  async findAll(filters: UserFilterDto = {}): Promise<User[]> {
    return this.userRepository.findWithFilters(filters);
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
    return this.userRepository.save(user);
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
  }

  async updateStatus(id: string, status: UserStatus): Promise<User> {
    const user = await this.findOne(id);
    return this.userRepository.updateStatus(user, status);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.userRepository.remove(user);
  }

  async countByRole(): Promise<Record<UserRole, number>> {
    return this.userRepository.countByRole();
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { UserRepository } from '../users/repositories';
import { UsersService } from '../users/users.service';
import { UserRole, UserStatus } from '../users/enums/user-role.enum';
import { CreateUserDto } from '../users/dto';

@Injectable()
export class UserSeeder {
  private readonly logger = new Logger(UserSeeder.name);

  constructor(private readonly userRepository: UserRepository) {}

  async seed(): Promise<void> {
    this.logger.log('Starting user seeding...');

    const seedUsers: CreateUserDto[] = [
      // Admin user
      {
        firstName: 'System',
        lastName: 'Administrator',
        email: 'admin@ibibina.rw',
        password: 'Admin@123',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
      // Chairperson
      {
        firstName: 'Jean',
        lastName: 'Uwimana',
        phone: '+250788123456',
        pin: '123456',
        role: UserRole.CHAIRPERSON,
        status: UserStatus.ACTIVE,
      },
      // Financial officer
      {
        firstName: 'Marie',
        lastName: 'Mukamana',
        phone: '+250788234567',
        pin: '234567',
        role: UserRole.FINANCIAL,
        status: UserStatus.ACTIVE,
      },
      // Members
      {
        firstName: 'Claude',
        lastName: 'Niyonzima',
        phone: '+250788345678',
        pin: '345678',
        role: UserRole.MEMBER,
        status: UserStatus.ACTIVE,
      },
      {
        firstName: 'Grace',
        lastName: 'Uwase',
        phone: '+250788456789',
        pin: '456789',
        role: UserRole.MEMBER,
        status: UserStatus.ACTIVE,
      },
      {
        firstName: 'Eric',
        lastName: 'Habimana',
        phone: '+250788567890',
        pin: '567890',
        role: UserRole.MEMBER,
        status: UserStatus.ACTIVE,
      },
    ];

    for (const userData of seedUsers) {
      try {
        const identifier = userData.email || userData.phone;
        const existing = await this.userRepository.findByIdentifier(identifier!);

        if (existing) {
          this.logger.log(`User ${identifier} already exists, skipping...`);
          continue;
        }

        const user = this.userRepository.create(userData);
        await this.userRepository.save(user);
        this.logger.log(
          `✓ Created ${user.role} user: ${user.firstName} ${user.lastName} (${identifier})`,
        );
      } catch (error) {
        this.logger.error(`Failed to create user ${userData.email || userData.phone}`, error);
      }
    }

    this.logger.log('User seeding completed!');
  }

  async clear(): Promise<void> {
    this.logger.warn('Clearing all users from database...');
    const users = await this.userRepository.find();
    await this.userRepository.remove(users);
    this.logger.log(`Removed ${users.length} users`);
  }
}

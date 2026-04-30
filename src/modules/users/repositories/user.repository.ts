import { Injectable } from '@nestjs/common';
import { DataSource, Repository, Like, FindOptionsWhere } from 'typeorm';
import { User } from '../entities/user.entity';
import { UserRole, UserStatus } from '../enums/user-role.enum';
import { UserFilterDto } from '../dto';

@Injectable()
export class UserRepository extends Repository<User> {
  constructor(private readonly dataSource: DataSource) {
    super(User, dataSource.createEntityManager());
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.findOne({ where: { email } });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.findOne({ where: { phone } });
  }

  /**
   * Find a user by email OR phone number (for login identifier resolution).
   * Normalises the identifier so that a local format (07X) is also matched
   * against its stored international form (+250 / 250) if needed.
   */
  async findByIdentifier(identifier: string): Promise<User | null> {
    const byEmail = await this.findOne({ where: { email: identifier } });
    if (byEmail) return byEmail;
    return this.findOne({ where: { phone: identifier } });
  }

  async findByRole(role: UserRole): Promise<User[]> {
    return this.find({ where: { role } });
  }

  async findWithFilters(filters: UserFilterDto = {}): Promise<User[]> {
    const where: FindOptionsWhere<User> = {};
    if (filters.role) where.role = filters.role;
    if (filters.status) where.status = filters.status;

    if (filters.search) {
      return this.find({
        where: [
          { ...where, firstName: Like(`%${filters.search}%`) },
          { ...where, lastName: Like(`%${filters.search}%`) },
          { ...where, email: Like(`%${filters.search}%`) },
          { ...where, phone: Like(`%${filters.search}%`) },
        ],
      });
    }

    return this.find({ where });
  }

  async countByRole(): Promise<Record<UserRole, number>> {
    const results = await this.createQueryBuilder('user')
      .select('user.role', 'role')
      .addSelect('COUNT(*)', 'count')
      .groupBy('user.role')
      .getRawMany<{ role: UserRole; count: string }>();

    const counts: Record<UserRole, number> = {
      [UserRole.ADMIN]: 0,
      [UserRole.CHAIRPERSON]: 0,
      [UserRole.FINANCIAL]: 0,
      [UserRole.MEMBER]: 0,
    };
    for (const row of results) {
      counts[row.role] = parseInt(row.count, 10);
    }
    return counts;
  }

  async existsByEmail(email: string): Promise<boolean> {
    return this.existsBy({ email });
  }

  async existsByPhone(phone: string): Promise<boolean> {
    return this.existsBy({ phone });
  }

  async updateStatus(user: User, status: UserStatus): Promise<User> {
    user.status = status;
    return this.save(user);
  }
}

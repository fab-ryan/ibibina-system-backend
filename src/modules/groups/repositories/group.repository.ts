import { Injectable } from '@nestjs/common';
import { DataSource, Repository, Like } from 'typeorm';
import { Group } from '../entities/group.entity';
import { GroupFilterDto } from '../dto/group.dto';
import { PaginationHelper } from '@/utils/paginate';

@Injectable()
export class GroupRepository extends Repository<Group> {
  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationHelper: PaginationHelper<Group>,
  ) {
    super(Group, dataSource.createEntityManager());
  }

  async existsByName(name: string): Promise<boolean> {
    return this.existsBy({ name });
  }

  async findWithFilters(filters: GroupFilterDto = {}) {
    const groupQuery = this.createQueryBuilder('group').orderBy('group.createdAt', 'DESC');

    if (filters.search)
      groupQuery.andWhere('group.name ILIKE :name', { name: `%${filters.search}%` });
    if (typeof filters.isActive === 'boolean') {
      groupQuery.andWhere('group.isActive = :isActive', { isActive: filters.isActive });
    }

    return await this.paginationHelper.run(groupQuery);
  }

  async findByGroupeCode(groupe_code: string): Promise<Group | null> {
    return this.findOne({ where: { groupe_code } });
  }

  async existsByGroupeCode(groupe_code: string): Promise<boolean> {
    return this.existsBy({ groupe_code });
  }
}

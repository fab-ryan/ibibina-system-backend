import { Injectable } from '@nestjs/common';
import { DataSource, Repository, Like } from 'typeorm';
import { Group } from '../entities/group.entity';
import { GroupFilterDto } from '../dto/group.dto';

@Injectable()
export class GroupRepository extends Repository<Group> {
  constructor(private readonly dataSource: DataSource) {
    super(Group, dataSource.createEntityManager());
  }

  async existsByName(name: string): Promise<boolean> {
    return this.existsBy({ name });
  }

  async findWithFilters(filters: GroupFilterDto = {}): Promise<Group[]> {
    if (filters.search) {
      return this.find({
        where: [
          { name: Like(`%${filters.search}%`) },
          { description: Like(`%${filters.search}%`) },
        ],
      });
    }

    if (typeof filters.isActive === 'boolean') {
      return this.find({ where: { isActive: filters.isActive } });
    }

    return this.find();
  }

  async findByGroupeCode(groupe_code: string): Promise<Group | null> {
    return this.findOne({ where: { groupe_code } });
  }

  async existsByGroupeCode(groupe_code: string): Promise<boolean> {
    return this.existsBy({ groupe_code });
  }
}

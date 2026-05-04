import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Activity } from '../entities/activity.entity';
import { ActivityFilterDto } from '../dto/activity.dto';

@Injectable()
export class ActivityRepository extends Repository<Activity> {
  constructor(private readonly dataSource: DataSource) {
    super(Activity, dataSource.createEntityManager());
  }

  async findWithFilters(filters: ActivityFilterDto = {}): Promise<[Activity[], number]> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;

    const qb = this.createQueryBuilder('a')
      .leftJoinAndSelect('a.actor', 'actor')
      .leftJoinAndSelect('a.group', 'group')
      .orderBy('a.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.groupId) qb.andWhere('a.groupId = :groupId', { groupId: filters.groupId });
    if (filters.actorId) qb.andWhere('a.actorId = :actorId', { actorId: filters.actorId });
    if (filters.type) qb.andWhere('LOWER(a.type) = LOWER(:type)', { type: filters.type });
    if (filters.action) qb.andWhere('LOWER(a.action) = LOWER(:action)', { action: filters.action });
    if (filters.status) qb.andWhere('LOWER(a.status) = LOWER(:status)', { status: filters.status });
    if (filters.from) qb.andWhere('a.createdAt >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('a.createdAt <= :to', { to: filters.to });

    return qb.getManyAndCount();
  }
}

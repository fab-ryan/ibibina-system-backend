import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUserType } from '@/common/middlewares/authenticate.middleware';
import { UserRole } from '@/modules/users/enums/user-role.enum';
import { User } from '@/modules/users/entities/user.entity';
import { Group } from '@/modules/groups/entities/group.entity';
import { PenaltyRepository } from './repositories/penalty.repository';
import type { MemberPenaltySummary, PenaltySummary } from './repositories/penalty.repository';
import { Penalty, PenaltyStatus } from './entities/penalty.entity';
import {
  IssuePenaltyDto,
  PenaltyFilterDto,
  SettlePenaltyDto,
  UpdatePenaltyDto,
  WaivePenaltyDto,
} from './dto/penalty.dto';

const ISSUER_ROLES = [UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE];

@Injectable()
export class PenaltiesService {
  constructor(
    private readonly penaltyRepository: PenaltyRepository,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
  ) {}

  // ─── Issue a penalty ────────────────────────────────────────────────────────

  async issue(dto: IssuePenaltyDto, actor: AuthUserType): Promise<Penalty> {
    await this.assertGroupAccess(dto.groupId, actor);
    await this.assertMemberBelongsToGroup(dto.userId, dto.groupId);

    const penalty = this.penaltyRepository.create({
      ...dto,
      currency: dto.currency ?? 'RWF',
      status: PenaltyStatus.PENDING,
      issuedById: actor.sub,
    });

    return this.penaltyRepository.save(penalty);
  }

  // ─── List with filters ──────────────────────────────────────────────────────

  async findAll(
    filters: PenaltyFilterDto,
    actor: AuthUserType,
  ): Promise<{ data: Penalty[]; total: number; page: number; limit: number }> {
    const scoped = this.applyActorScope(filters, actor);
    const [data, total] = await this.penaltyRepository.findWithFilters(scoped);
    return { data, total, page: scoped.page ?? 1, limit: scoped.limit ?? 50 };
  }

  // ─── Single ─────────────────────────────────────────────────────────────────

  async findOne(id: string, actor: AuthUserType): Promise<Penalty> {
    const penalty = await this.penaltyRepository.findOne({
      where: { id },
      relations: ['user', 'group', 'contribution'],
    });
    if (!penalty) throw new NotFoundException(`Penalty ${id} not found`);

    this.assertReadAccess(penalty, actor);
    return penalty;
  }

  // ─── Update ─────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdatePenaltyDto, actor: AuthUserType): Promise<Penalty> {
    const penalty = await this.penaltyRepository.findOne({ where: { id } });
    if (!penalty) throw new NotFoundException(`Penalty ${id} not found`);

    await this.assertGroupAccess(penalty.groupId, actor);

    if (penalty.status === PenaltyStatus.PAID) {
      throw new BadRequestException('A settled penalty cannot be modified');
    }

    Object.assign(penalty, dto);
    return this.penaltyRepository.save(penalty);
  }

  // ─── Settle (mark paid) ─────────────────────────────────────────────────────

  async settle(id: string, dto: SettlePenaltyDto, actor: AuthUserType): Promise<Penalty> {
    const penalty = await this.penaltyRepository.findOne({ where: { id } });
    if (!penalty) throw new NotFoundException(`Penalty ${id} not found`);

    await this.assertGroupAccess(penalty.groupId, actor);

    if (penalty.status === PenaltyStatus.PAID) {
      throw new BadRequestException('Penalty is already settled');
    }
    if (penalty.status === PenaltyStatus.WAIVED) {
      throw new BadRequestException('A waived penalty cannot be settled');
    }

    penalty.status = PenaltyStatus.PAID;
    penalty.paymentMethod = dto.paymentMethod;
    penalty.paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    penalty.momoRef = dto.momoRef;
    penalty.bankRef = dto.bankRef;
    if (dto.notes) penalty.notes = dto.notes;

    return this.penaltyRepository.save(penalty);
  }

  // ─── Waive ──────────────────────────────────────────────────────────────────

  async waive(id: string, dto: WaivePenaltyDto, actor: AuthUserType): Promise<Penalty> {
    const penalty = await this.penaltyRepository.findOne({ where: { id } });
    if (!penalty) throw new NotFoundException(`Penalty ${id} not found`);

    await this.assertGroupAccess(penalty.groupId, actor);

    if (
      actor.role !== UserRole.ADMIN.toString() &&
      actor.role !== UserRole.CHAIRPERSON.toString()
    ) {
      throw new ForbiddenException('Only admin or chairperson can waive a penalty');
    }

    if (penalty.status === PenaltyStatus.PAID) {
      throw new BadRequestException('A settled penalty cannot be waived');
    }

    penalty.status = PenaltyStatus.WAIVED;
    penalty.notes = dto.reason;
    return this.penaltyRepository.save(penalty);
  }

  // ─── Delete ─────────────────────────────────────────────────────────────────

  async remove(id: string, actor: AuthUserType): Promise<void> {
    const penalty = await this.penaltyRepository.findOne({ where: { id } });
    if (!penalty) throw new NotFoundException(`Penalty ${id} not found`);

    if (actor.role !== UserRole.ADMIN.toString()) {
      throw new ForbiddenException('Only admins can delete penalty records');
    }

    await this.penaltyRepository.remove(penalty);
  }

  // ─── Group summary ───────────────────────────────────────────────────────────

  async getGroupSummary(groupId: string, actor: AuthUserType): Promise<PenaltySummary> {
    await this.assertGroupAccess(groupId, actor);
    return this.penaltyRepository.getGroupSummary(groupId);
  }

  // ─── Member summary ──────────────────────────────────────────────────────────

  async getMemberSummary(
    userId: string,
    groupId: string,
    actor: AuthUserType,
  ): Promise<MemberPenaltySummary> {
    if (actor.role === UserRole.MEMBER.toString() && actor.sub !== userId) {
      throw new ForbiddenException('Members can only view their own penalty summary');
    }
    await this.assertGroupAccess(groupId, actor);
    return this.penaltyRepository.getMemberSummary(userId, groupId);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async assertGroupAccess(groupId: string, actor: AuthUserType): Promise<void> {
    const exists = await this.groupRepository.existsBy({ id: groupId });
    if (!exists) throw new NotFoundException(`Group ${groupId} not found`);

    if (actor.role === UserRole.ADMIN.toString()) return;

    if (!ISSUER_ROLES.includes(actor.role as UserRole)) {
      // Members can read but not mutate; mutations are guarded per method
      if (actor.role !== UserRole.MEMBER.toString()) {
        throw new ForbiddenException('You do not have permission to access penalties');
      }
    }

    if (actor.groupId !== groupId) {
      throw new ForbiddenException('You can only access penalties within your own group');
    }
  }

  private async assertMemberBelongsToGroup(userId: string, groupId: string): Promise<void> {
    const belongs = await this.userRepository.existsBy({ id: userId, groupId });
    if (!belongs) {
      throw new BadRequestException(`User ${userId} is not a member of group ${groupId}`);
    }
  }

  private assertReadAccess(penalty: Penalty, actor: AuthUserType): void {
    if (actor.role === UserRole.ADMIN.toString()) return;

    if (actor.role === UserRole.MEMBER.toString()) {
      if (actor.sub !== penalty.userId) {
        throw new ForbiddenException('Members can only view their own penalties');
      }
      return;
    }

    if (actor.groupId !== penalty.groupId) {
      throw new ForbiddenException('You can only view penalties within your own group');
    }
  }

  private applyActorScope(filters: PenaltyFilterDto, actor: AuthUserType): PenaltyFilterDto {
    const scoped = { ...filters };

    if (actor.role === UserRole.MEMBER.toString()) {
      scoped.userId = actor.sub;
      return scoped;
    }

    if (actor.role !== UserRole.ADMIN.toString()) {
      scoped.groupId = actor.groupId;
    }

    return scoped;
  }
}

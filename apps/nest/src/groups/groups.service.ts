import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createSlug } from '../common/utils/slug';
import { CreateGroupDto } from './dto/create-group.dto';
import { Group } from './entities/group.entity';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(Group)
    private readonly repository: Repository<Group>,
  ) {}

  async create(ownerId: string, input: CreateGroupDto): Promise<Group> {
    const group = this.repository.create({
      name: input.name.trim(),
      ownerId,
      slug: createSlug(input.name, 'group'),
    });

    try {
      return await this.repository.save(group);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('A group with this name already exists');
      }
      throw error;
    }
  }

  async listOwned(ownerId: string): Promise<Group[]> {
    const result = await this.repository
      .createQueryBuilder('group')
      .where('group.ownerId = :ownerId', { ownerId })
      .leftJoin('group.projects', 'project')
      .addSelect('COUNT(project.id)', 'projectCount')
      .groupBy('group.id')
      .orderBy('group.createdAt', 'DESC')
      .getRawAndEntities();

    return result.entities.map((group, index) =>
      Object.assign(group, {
        projectCount: Number(result.raw[index]?.projectCount ?? 0),
      }),
    );
  }

  async listAccessible(userId: string): Promise<Group[]> {
    const result = await this.repository
      .createQueryBuilder('group')
      .leftJoin('group.projects', 'project')
      .leftJoin(
        'project_members',
        'member',
        'member.project_id = project.id AND member.user_id = :userId',
        { userId },
      )
      .where(
        'group.ownerId = :userId OR project.ownerId = :userId OR member.id IS NOT NULL',
        { userId },
      )
      .addSelect('COUNT(DISTINCT project.id)', 'projectCount')
      .groupBy('group.id')
      .orderBy('group.createdAt', 'DESC')
      .getRawAndEntities();
    return result.entities.map((group, index) =>
      Object.assign(group, {
        projectCount: Number(result.raw[index]?.projectCount ?? 0),
        isOwner: group.ownerId === userId,
      }),
    );
  }
  async findAccessibleBySlug(userId: string, slug: string): Promise<Group> {
    const groups = (await this.listAccessible(userId)).filter(
      (group) => group.slug === slug,
    );
    if (groups.length !== 1)
      throw new NotFoundException('Group not found or ambiguous');
    return groups[0];
  }
  async findOwnedBySlug(ownerId: string, slug: string): Promise<Group> {
    const group = await this.repository.findOne({
      where: { ownerId, slug },
    });
    if (!group) throw new NotFoundException('Group not found');
    return group;
  }
}

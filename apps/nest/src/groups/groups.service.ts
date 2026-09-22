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
        throw new ConflictException('该组名称已存在');
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

  async findOwnedBySlug(ownerId: string, slug: string): Promise<Group> {
    const group = await this.repository.findOne({
      where: { ownerId, slug },
    });
    if (!group) throw new NotFoundException('组不存在');
    return group;
  }
}

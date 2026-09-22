import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { CreateGroupDto } from './dto/create-group.dto';
import { GroupsService } from './groups.service';

interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

@ApiTags('groups')
@ApiBearerAuth()
@Controller('groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() input: CreateGroupDto) {
    return this.groups.create(request.user.id, input);
  }

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.groups.listOwned(request.user.id);
  }

  @Get(':slug')
  detail(@Req() request: AuthenticatedRequest, @Param('slug') slug: string) {
    return this.groups.findOwnedBySlug(request.user.id, slug);
  }
}

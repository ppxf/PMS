import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { CreateMonitoringProjectDto } from './dto/create-monitoring-project.dto';
import { MonitoringProjectsService } from './monitoring-projects.service';

interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

@ApiTags('monitoring-projects')
@ApiBearerAuth()
@Controller('groups/:groupSlug/projects')
export class MonitoringProjectsController {
  constructor(private readonly projects: MonitoringProjectsService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') groupSlug: string,
    @Body() input: CreateMonitoringProjectDto,
  ) {
    return this.projects.create(request.user.id, groupSlug, input);
  }

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') groupSlug: string,
  ) {
    return this.projects.listOwned(request.user.id, groupSlug);
  }

  @Get(':projectSlug/connection')
  connection(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') groupSlug: string,
    @Param('projectSlug') projectSlug: string,
  ) {
    return this.projects.getConnection(request.user.id, groupSlug, projectSlug);
  }

  @Get(':projectSlug')
  detail(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') groupSlug: string,
    @Param('projectSlug') projectSlug: string,
  ) {
    return this.projects.findOwnedBySlug(
      request.user.id,
      groupSlug,
      projectSlug,
    );
  }
}

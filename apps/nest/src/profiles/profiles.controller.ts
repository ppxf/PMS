import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import type { ProfileQuery } from './profiles-contract';
import { ProfileQueryPipe } from './profiles-validation';
import { ProfilesService } from './profiles.service';
@ApiTags('profiles')
@ApiBearerAuth()
@Controller('groups/:groupSlug/projects/:projectSlug/profiles')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}
  @Get('config')
  config(
    @Req() req: Request & { user: AuthUser },
    @Param('groupSlug') group: string,
    @Param('projectSlug') project: string,
  ) {
    return this.profiles.config(req.user.id, group, project);
  }
  @Post('query')
  query(
    @Req() req: Request & { user: AuthUser },
    @Param('groupSlug') group: string,
    @Param('projectSlug') project: string,
    @Body(new ProfileQueryPipe()) query: ProfileQuery,
  ) {
    return this.profiles.query(req.user.id, group, project, query);
  }
  @Get(':profileId')
  detail(
    @Req() req: Request & { user: AuthUser },
    @Param('groupSlug') group: string,
    @Param('projectSlug') project: string,
    @Param('profileId') profileId: string,
  ) {
    return this.profiles.detail(req.user.id, group, project, profileId);
  }
}

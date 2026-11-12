import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { ProjectInvitationsService } from './project-invitations.service';
import { ProjectInvitationRateLimitGuard } from './project-invitations.guard';

interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

@ApiTags('project-invitations')
@ApiBearerAuth()
@UseGuards(ProjectInvitationRateLimitGuard)
@Controller('groups/:groupSlug/projects/:projectSlug')
export class ProjectMembersController {
  constructor(private readonly invitations: ProjectInvitationsService) {}
  @Get('members') members(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') group: string,
    @Param('projectSlug') project: string,
  ) {
    return this.invitations.members(request.user.id, group, project);
  }
  @Patch('members/:userId') update(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') group: string,
    @Param('projectSlug') project: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() input: { permissions?: unknown },
  ) {
    return this.invitations.updateMember(
      request.user.id,
      group,
      project,
      userId,
      input?.permissions,
    );
  }
  @Delete('members/:userId') remove(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') group: string,
    @Param('projectSlug') project: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.invitations.removeMember(
      request.user.id,
      group,
      project,
      userId,
    );
  }
  @Get('invitations') list(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') group: string,
    @Param('projectSlug') project: string,
  ) {
    return this.invitations.list(request.user.id, group, project);
  }
  @Post('invitations') create(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') group: string,
    @Param('projectSlug') project: string,
    @Body() input: { email?: unknown; permissions?: unknown },
  ) {
    return this.invitations.create(request.user.id, group, project, input);
  }
  @Post('invitations/:id/revoke') revoke(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') group: string,
    @Param('projectSlug') project: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invitations.revoke(request.user.id, group, project, id);
  }
  @Post('invitations/:id/resend') resend(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') group: string,
    @Param('projectSlug') project: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invitations.resend(request.user.id, group, project, id);
  }
}

@ApiTags('project-invitations')
@ApiBearerAuth()
@UseGuards(ProjectInvitationRateLimitGuard)
@Controller('project-invitations')
export class ProjectInvitationsController {
  constructor(private readonly invitations: ProjectInvitationsService) {}
  @Get('preview') preview(
    @Req() request: AuthenticatedRequest,
    @Query('token') token: unknown,
  ) {
    return this.invitations.preview(request.user.id, token);
  }
  @Post('accept') accept(
    @Req() request: AuthenticatedRequest,
    @Body() input: { token?: unknown },
  ) {
    return this.invitations.accept(request.user.id, input?.token);
  }
}

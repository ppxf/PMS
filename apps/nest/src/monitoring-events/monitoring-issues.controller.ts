import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe,
  Patch, Query, Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { ListIssuesQueryDto } from './dto/list-issues-query.dto';
import { ArchiveIssueDto } from './dto/archive-issue.dto';
import { UpdateIssueStatusDto } from './dto/update-issue-status.dto';
import { MonitoringEventsService } from './monitoring-events.service';

interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

@ApiTags('monitoring-issues')
@ApiBearerAuth()
@Controller('groups/:groupSlug/projects/:projectSlug/issues')
export class MonitoringIssuesController {
  constructor(private readonly events: MonitoringEventsService) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') groupSlug: string,
    @Param('projectSlug') projectSlug: string,
    @Query() query: ListIssuesQueryDto,
  ) {
    return this.events.listOwnedIssues(request.user.id, groupSlug, projectSlug, query);
  }

  @Get(':issueId')
  detail(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') groupSlug: string,
    @Param('projectSlug') projectSlug: string,
    @Param('issueId', new ParseUUIDPipe()) issueId: string,
  ) {
    return this.events.getOwnedIssue(request.user.id, groupSlug, projectSlug, issueId);
  }

  @Patch(':issueId/status')
  updateStatus(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') groupSlug: string,
    @Param('projectSlug') projectSlug: string,
    @Param('issueId', new ParseUUIDPipe()) issueId: string,
    @Body() body: UpdateIssueStatusDto,
  ) {
    return this.events.updateOwnedIssueStatus(
      request.user.id, groupSlug, projectSlug, issueId, body.status,
    );
  }

  @Patch(':issueId/archive')
  archive(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') groupSlug: string,
    @Param('projectSlug') projectSlug: string,
    @Param('issueId', new ParseUUIDPipe()) issueId: string,
    @Body() body: ArchiveIssueDto,
  ) {
    return this.events.archiveOwnedIssue(
      request.user.id, groupSlug, projectSlug, issueId, body,
    );
  }

  @Patch(':issueId/restore')
  restore(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') groupSlug: string,
    @Param('projectSlug') projectSlug: string,
    @Param('issueId', new ParseUUIDPipe()) issueId: string,
  ) {
    return this.events.restoreOwnedIssue(request.user.id, groupSlug, projectSlug, issueId);
  }

  @Delete(':issueId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') groupSlug: string,
    @Param('projectSlug') projectSlug: string,
    @Param('issueId', new ParseUUIDPipe()) issueId: string,
  ) {
    return this.events.deleteOwnedIssue(request.user.id, groupSlug, projectSlug, issueId);
  }

  @Delete(':issueId/permanent')
  @HttpCode(HttpStatus.NO_CONTENT)
  permanentlyRemove(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') groupSlug: string,
    @Param('projectSlug') projectSlug: string,
    @Param('issueId', new ParseUUIDPipe()) issueId: string,
  ) {
    return this.events.permanentlyDeleteOwnedIssue(
      request.user.id, groupSlug, projectSlug, issueId,
    );
  }
}

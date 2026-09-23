import { Controller, Get, Param, ParseUUIDPipe, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { ListIssuesQueryDto } from './dto/list-issues-query.dto';
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
}

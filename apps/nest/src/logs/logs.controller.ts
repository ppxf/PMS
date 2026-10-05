import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import type { LogQuery } from './logs-contract';
import { LogQueryPipe } from './logs-validation';
import { LogsService } from './logs.service';
@ApiTags('logs')
@ApiBearerAuth()
@Controller('groups/:groupSlug/projects/:projectSlug/logs')
export class LogsController {
  constructor(private readonly logs: LogsService) {}
  @Get('fields')
  fields(
    @Req() req: Request & { user: AuthUser },
    @Param('groupSlug') group: string,
    @Param('projectSlug') project: string,
  ) {
    return this.logs.fields(req.user.id, group, project);
  }
  @Post('query')
  query(
    @Req() req: Request & { user: AuthUser },
    @Param('groupSlug') group: string,
    @Param('projectSlug') project: string,
    @Body(new LogQueryPipe()) query: LogQuery,
  ) {
    return this.logs.query(req.user.id, group, project, query);
  }
}

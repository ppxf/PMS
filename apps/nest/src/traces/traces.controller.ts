import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { SpanQuery } from './traces-contract';
import { SpanQueryPipe } from './traces-validation';
import { TracesService } from './traces.service';

interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

@ApiTags('traces')
@ApiBearerAuth()
@Controller('groups/:groupSlug/projects/:projectSlug')
export class TracesController {
  constructor(private readonly traces: TracesService) {}
  @Get('spans/fields')
  fields(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') group: string,
    @Param('projectSlug') project: string,
  ) {
    return this.traces.fields(request.user.id, group, project);
  }
  @Post('spans/samples')
  samples(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') group: string,
    @Param('projectSlug') project: string,
    @Body(new SpanQueryPipe()) query: unknown,
  ) {
    return this.traces.samples(
      request.user.id,
      group,
      project,
      query as SpanQuery,
    );
  }
  @Post('spans/timeseries')
  timeseries(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') group: string,
    @Param('projectSlug') project: string,
    @Body(new SpanQueryPipe()) query: unknown,
  ) {
    return this.traces.timeseries(
      request.user.id,
      group,
      project,
      query as SpanQuery,
    );
  }
  @Post('spans/aggregates')
  aggregates(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') group: string,
    @Param('projectSlug') project: string,
    @Body(new SpanQueryPipe()) query: unknown,
  ) {
    return this.traces.aggregates(
      request.user.id,
      group,
      project,
      query as SpanQuery,
    );
  }
  @Post('spans/traces')
  traceSamples(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') group: string,
    @Param('projectSlug') project: string,
    @Body(new SpanQueryPipe()) query: unknown,
  ) {
    return this.traces.traceSamples(
      request.user.id,
      group,
      project,
      query as SpanQuery,
    );
  }
  @Get('traces/:traceId')
  detail(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') group: string,
    @Param('projectSlug') project: string,
    @Param('traceId') traceId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.traces.detail(request.user.id, group, project, traceId, cursor);
  }
}

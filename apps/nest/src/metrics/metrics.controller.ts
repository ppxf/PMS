import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import type { MetricQuery, TraceMetricsQuery } from './metrics-contract';
import { MetricQueryPipe, TraceMetricsQueryPipe } from './metrics-validation';
import { MetricsService } from './metrics.service';

@ApiTags('metrics')
@ApiBearerAuth()
@Controller('groups/:groupSlug/projects/:projectSlug/metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}
  @Get('traces/:traceId')
  forTrace(
    @Req() req: Request & { user: AuthUser },
    @Param('groupSlug') group: string,
    @Param('projectSlug') project: string,
    @Param('traceId') traceId: string,
    @Query(new TraceMetricsQueryPipe()) query: TraceMetricsQuery,
  ) {
    return this.metrics.forTrace(req.user.id, group, project, traceId, query);
  }
  @Get('catalog')
  catalog(
    @Req() req: Request & { user: AuthUser },
    @Param('groupSlug') group: string,
    @Param('projectSlug') project: string,
  ) {
    return this.metrics.catalog(req.user.id, group, project);
  }
  @Post('query')
  query(
    @Req() req: Request & { user: AuthUser },
    @Param('groupSlug') group: string,
    @Param('projectSlug') project: string,
    @Body(new MetricQueryPipe()) query: MetricQuery,
  ) {
    return this.metrics.query(req.user.id, group, project, query);
  }
}

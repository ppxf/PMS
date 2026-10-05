import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { CreateMonitoringProjectDto } from './dto/create-monitoring-project.dto';
import { MonitoringProjectsService } from './monitoring-projects.service';
import { UpdateTracingPipe } from './dto/update-tracing.dto';
import { PropagationSettingsPipe } from './dto/propagation-settings.pipe';
import type { PropagationSettings } from './dto/propagation-settings.pipe';
import { UpdateOriginsPipe } from './dto/update-origins.pipe';
import { UpdateMetricsPipe } from './dto/update-metrics.pipe';

interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

@ApiTags('monitoring-projects')
@ApiBearerAuth()
@Controller('groups/:groupSlug/projects')
export class MonitoringProjectsController {
  constructor(private readonly projects: MonitoringProjectsService) {}

  @Patch(':projectSlug/metrics')
  metrics(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') groupSlug: string,
    @Param('projectSlug') projectSlug: string,
    @Body(new UpdateMetricsPipe()) input: { metricsEnabled: boolean },
  ) {
    return this.projects.updateMetrics(
      request.user.id,
      groupSlug,
      projectSlug,
      input.metricsEnabled,
    );
  }

  @Patch(':projectSlug/origins')
  origins(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') groupSlug: string,
    @Param('projectSlug') projectSlug: string,
    @Body(new UpdateOriginsPipe()) input: { allowedOrigins: string[] },
  ) {
    return this.projects.updateOrigins(
      request.user.id,
      groupSlug,
      projectSlug,
      input.allowedOrigins,
    );
  }

  @Patch(':projectSlug/propagation')
  propagation(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') groupSlug: string,
    @Param('projectSlug') projectSlug: string,
    @Body(new PropagationSettingsPipe()) settings: PropagationSettings,
  ) {
    return this.projects.updatePropagation(
      request.user.id,
      groupSlug,
      projectSlug,
      settings,
    );
  }

  @Patch(':projectSlug/tracing')
  tracing(
    @Req() request: AuthenticatedRequest,
    @Param('groupSlug') groupSlug: string,
    @Param('projectSlug') projectSlug: string,
    @Body(new UpdateTracingPipe()) input: unknown,
  ) {
    return this.projects.updateTracing(
      request.user.id,
      groupSlug,
      projectSlug,
      (input as { tracingEnabled: boolean }).tracingEnabled,
    );
  }

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

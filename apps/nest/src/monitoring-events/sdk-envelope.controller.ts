import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Optional,
  ServiceUnavailableException,
  ForbiddenException,
  Ip,
} from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { SkipResponseWrap } from '../common/decorators/skip-response-wrap.decorator';
import { IngestEnvelopeDto } from './dto/ingest-envelope.dto';
import { SdkEnvelopePipe } from '../traces/sdk-envelope.pipe';
import { MonitoringEventsService } from './monitoring-events.service';
import { TracesService } from '../traces/traces.service';
import { TransactionEnvelope } from '../traces/traces-contract';
import { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
import { normalizeSdkOrigin } from '../common/http/sdk-origin';
import { MetricsService } from '../metrics/metrics.service';
import { MetricsEnvelope } from '../metrics/metrics-contract';
import { LogsService } from '../logs/logs.service';
import type { LogsEnvelope } from '../logs/logs-contract';
import { ProfilesService } from '../profiles/profiles.service';
import type {
  ProfileEnvelope,
  ProfileDiagnosticEnvelope,
} from '../profiles/profiles-contract';

@ApiTags('sdk')
@Controller('sdk')
export class SdkEnvelopeController {
  constructor(
    private readonly events: MonitoringEventsService,
    @Optional() private readonly traces?: TracesService,
    @Optional() private readonly projects?: MonitoringProjectsService,
    @Optional() private readonly metrics?: MetricsService,
    @Optional() private readonly logs?: LogsService,
    @Optional() private readonly profiles?: ProfilesService,
  ) {}

  @Post(':projectId/envelope')
  @ApiBody({ type: IngestEnvelopeDto })
  @Public()
  @SkipResponseWrap()
  @HttpCode(HttpStatus.ACCEPTED)
  async ingest(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('x-pms-key') publicKey: string | undefined,
    @Body(new SdkEnvelopePipe()) envelope: unknown,
    @Headers('origin') origin?: string,
    @Ip() clientAddress?: string,
  ): Promise<void> {
    if (
      origin &&
      (!this.projects ||
        !(await this.projects.allowsSdkOrigin(
          projectId,
          normalizeSdkOrigin(origin),
        )))
    )
      throw new ForbiddenException('SDK Origin is not allowed');
    if ((envelope as { type?: string }).type === 'profile_diagnostic') {
      if (!this.profiles)
        throw new ServiceUnavailableException('Profiles service unavailable');
      return this.profiles.diagnostic(
        projectId,
        publicKey,
        envelope as ProfileDiagnosticEnvelope,
      );
    }
    if ((envelope as { type?: string }).type === 'profile') {
      if (!this.profiles)
        throw new ServiceUnavailableException('Profiles service unavailable');
      return this.profiles.ingest(
        projectId,
        publicKey,
        envelope as ProfileEnvelope,
      );
    }
    if ((envelope as { type?: string }).type === 'logs') {
      if (!this.logs)
        throw new ServiceUnavailableException('Logs service unavailable');
      return this.logs.ingest(projectId, publicKey, envelope as LogsEnvelope);
    }
    if ((envelope as { type?: string }).type === 'metrics') {
      if (!this.metrics)
        throw new ServiceUnavailableException('Metrics service unavailable');
      return this.metrics.ingest(
        projectId,
        publicKey,
        envelope as MetricsEnvelope,
        clientAddress,
      );
    }
    if ((envelope as { type?: string }).type === 'transaction') {
      if (!this.traces)
        throw new ServiceUnavailableException('Tracing service unavailable');
      return this.traces.ingest(
        projectId,
        publicKey,
        envelope as TransactionEnvelope,
      );
    }
    return this.events.ingest(
      projectId,
      publicKey,
      envelope as IngestEnvelopeDto,
    );
  }
}

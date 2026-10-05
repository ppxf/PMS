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

@ApiTags('sdk')
@Controller('sdk')
export class SdkEnvelopeController {
  constructor(
    private readonly events: MonitoringEventsService,
    @Optional() private readonly traces?: TracesService,
    @Optional() private readonly projects?: MonitoringProjectsService,
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

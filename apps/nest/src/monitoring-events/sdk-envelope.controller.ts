import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { SkipResponseWrap } from '../common/decorators/skip-response-wrap.decorator';
import { IngestEnvelopeDto } from './dto/ingest-envelope.dto';
import { IngestEnvelopePipe } from './ingest-envelope.pipe';
import { MonitoringEventsService } from './monitoring-events.service';
import type { IngressHeaders } from './monitoring-events.service';

@ApiTags('sdk')
@Controller('sdk')
export class SdkEnvelopeController {
  constructor(private readonly events: MonitoringEventsService) {}

  @Post(':projectId/envelope')
  @ApiBody({ type: IngestEnvelopeDto })
  @Public()
  @SkipResponseWrap()
  @HttpCode(HttpStatus.ACCEPTED)
  ingest(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('x-pms-key') publicKey: string | undefined,
    @Body(new IngestEnvelopePipe()) envelope: unknown,
    @Headers() requestHeaders: IngressHeaders,
  ): Promise<void> {
    return this.events.ingest(
      projectId,
      publicKey,
      envelope as IngestEnvelopeDto,
      requestHeaders,
    );
  }
}

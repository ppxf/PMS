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
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { SkipResponseWrap } from '../common/decorators/skip-response-wrap.decorator';
import { IngestEnvelopeDto } from './dto/ingest-envelope.dto';
import { MonitoringEventsService } from './monitoring-events.service';

@ApiTags('sdk')
@Controller('sdk')
export class SdkEnvelopeController {
  constructor(private readonly events: MonitoringEventsService) {}

  @Post(':projectId/envelope')
  @Public()
  @SkipResponseWrap()
  @HttpCode(HttpStatus.ACCEPTED)
  ingest(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('x-pms-key') publicKey: string | undefined,
    @Body() envelope: IngestEnvelopeDto,
  ): Promise<void> {
    return this.events.ingest(projectId, publicKey, envelope);
  }
}

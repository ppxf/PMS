import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { normalizeSdkOrigin } from '../common/http/sdk-origin';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CheckSdkDto } from './dto/check-sdk.dto';
import { MonitoringProjectsService } from './monitoring-projects.service';

@ApiTags('sdk')
@Controller('sdk')
export class SdkCheckController {
  constructor(private readonly projects: MonitoringProjectsService) {}

  @Post('check')
  @Public()
  @HttpCode(HttpStatus.OK)
  async check(@Body() input: CheckSdkDto, @Headers('origin') origin?: string) {
    if (
      origin &&
      !(await this.projects.allowsSdkOrigin(
        input.projectId,
        normalizeSdkOrigin(origin),
      ))
    )
      throw new ForbiddenException('SDK Origin is not allowed');
    return this.projects.checkConnection(input.projectId, input.publicKey);
  }
}

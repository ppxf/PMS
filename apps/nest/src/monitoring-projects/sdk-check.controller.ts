import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
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
  check(@Body() input: CheckSdkDto) {
    return this.projects.checkConnection(input.projectId, input.publicKey);
  }
}

import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import {
  HealthDataDto,
  HealthResponseDto,
} from './common/dto/health-response.dto';

@ApiTags('system')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: '服务健康检查' })
  @ApiOkResponse({ type: HealthResponseDto })
  getHealth(): HealthDataDto {
    return this.appService.getHealth();
  }
}

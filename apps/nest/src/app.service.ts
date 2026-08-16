import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthDataDto } from './common/dto/health-response.dto';

@Injectable()
export class AppService {
  constructor(private readonly config: ConfigService) {}

  getHealth(): HealthDataDto {
    return {
      name: this.config.get<string>('app.name', 'PMS API'),
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}

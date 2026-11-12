import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { CoordinationService } from './coordination.service';
@Global()
@Module({
  providers: [RedisService, CoordinationService],
  exports: [RedisService, CoordinationService],
})
export class CoordinationModule {}

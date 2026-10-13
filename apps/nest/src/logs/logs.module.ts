import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonitoringProjectsModule } from '../monitoring-projects/monitoring-projects.module';
import { LogBatchEntity, LogEntity } from './log.entity';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';
@Module({
  imports: [
    TypeOrmModule.forFeature([LogEntity, LogBatchEntity]),
    MonitoringProjectsModule,
  ],
  controllers: [LogsController],
  providers: [LogsService],
  exports: [LogsService],
})
export class LogsModule {}

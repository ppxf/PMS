import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonitoringProjectsModule } from '../monitoring-projects/monitoring-projects.module';
import { MetricBatchEntity, MetricEntity } from './metric.entity';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
@Module({
  imports: [
    TypeOrmModule.forFeature([MetricEntity, MetricBatchEntity]),
    MonitoringProjectsModule,
  ],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}

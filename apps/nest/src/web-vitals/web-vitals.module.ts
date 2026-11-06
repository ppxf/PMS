import { WebVitalsRetentionService } from './web-vitals-retention.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonitoringPageView, MonitoringWebVital } from './web-vitals.entity';
import { WebVitalsController } from './web-vitals.controller';
import { Module } from '@nestjs/common';
import { MonitoringProjectsModule } from '../monitoring-projects/monitoring-projects.module';
import { WebVitalsService } from './web-vitals.service';
@Module({
  imports: [
    MonitoringProjectsModule,
    TypeOrmModule.forFeature([MonitoringPageView, MonitoringWebVital]),
  ],
  controllers: [WebVitalsController],
  providers: [WebVitalsService, WebVitalsRetentionService],
  exports: [WebVitalsService],
})
export class WebVitalsModule {}

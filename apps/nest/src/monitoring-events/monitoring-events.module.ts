import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonitoringProjectsModule } from '../monitoring-projects/monitoring-projects.module';
import { MonitoringErrorIssue } from './entities/monitoring-error-issue.entity';
import { MonitoringEvent } from './entities/monitoring-event.entity';
import { MonitoringErrorSuppression } from './entities/monitoring-error-suppression.entity';
import { MonitoringEventsService } from './monitoring-events.service';
import { IssueAutoResolutionService } from './issue-auto-resolution.service';
import { MonitoringIssuesController } from './monitoring-issues.controller';
import { SdkEnvelopeController } from './sdk-envelope.controller';
import { TracesModule } from '../traces/traces.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MonitoringEvent,
      MonitoringErrorIssue,
      MonitoringErrorSuppression,
    ]),
    MonitoringProjectsModule,
    TracesModule,
    MetricsModule,
  ],
  controllers: [SdkEnvelopeController, MonitoringIssuesController],
  providers: [MonitoringEventsService, IssueAutoResolutionService],
})
export class MonitoringEventsModule {}

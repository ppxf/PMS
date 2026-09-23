import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonitoringProjectsModule } from '../monitoring-projects/monitoring-projects.module';
import { MonitoringErrorIssue } from './entities/monitoring-error-issue.entity';
import { MonitoringEvent } from './entities/monitoring-event.entity';
import { MonitoringEventsService } from './monitoring-events.service';
import { SdkEnvelopeController } from './sdk-envelope.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([MonitoringEvent, MonitoringErrorIssue]),
    MonitoringProjectsModule,
  ],
  controllers: [SdkEnvelopeController],
  providers: [MonitoringEventsService],
})
export class MonitoringEventsModule {}

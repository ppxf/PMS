import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonitoringProjectsModule } from '../monitoring-projects/monitoring-projects.module';
import { MonitoringSpanEntity } from './entities/monitoring-span.entity';
import { TraceIngestBatch } from './entities/trace-ingest-batch.entity';
import { TracesController } from './traces.controller';
import { TracesService } from './traces.service';
import { TracesRetentionService } from './traces-retention.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MonitoringSpanEntity, TraceIngestBatch]),
    MonitoringProjectsModule,
  ],
  controllers: [TracesController],
  providers: [TracesService, TracesRetentionService],
  exports: [TracesService],
})
export class TracesModule {}

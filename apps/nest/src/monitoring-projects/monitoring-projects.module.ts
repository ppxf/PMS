import { ProjectAccessModule } from '../project-access/project-access.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupsModule } from '../groups/groups.module';
import { MonitoringProject } from './entities/monitoring-project.entity';
import { MonitoringProjectsController } from './monitoring-projects.controller';
import { MonitoringProjectsService } from './monitoring-projects.service';
import { SdkCheckController } from './sdk-check.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([MonitoringProject]),
    GroupsModule,
    ProjectAccessModule,
  ],
  controllers: [MonitoringProjectsController, SdkCheckController],
  providers: [MonitoringProjectsService],
  exports: [MonitoringProjectsService],
})
export class MonitoringProjectsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonitoringProject } from '../monitoring-projects/entities/monitoring-project.entity';
import { ProjectMember } from './project-member.entity';
import { ProjectAccessService } from './project-access.service';
@Module({
  imports: [TypeOrmModule.forFeature([MonitoringProject, ProjectMember])],
  providers: [ProjectAccessService],
  exports: [ProjectAccessService, TypeOrmModule],
})
export class ProjectAccessModule {}

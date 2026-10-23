import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonitoringProjectsModule } from '../monitoring-projects/monitoring-projects.module';
import { ProfileEntity } from './profile.entity';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
@Module({
  imports: [
    TypeOrmModule.forFeature([ProfileEntity]),
    MonitoringProjectsModule,
  ],
  controllers: [ProfilesController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}

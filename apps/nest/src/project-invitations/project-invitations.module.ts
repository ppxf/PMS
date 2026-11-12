import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectAccessModule } from '../project-access/project-access.module';
import { MailModule } from '../mail/mail.module';
import { SdkRateLimitService } from '../common/http/sdk-rate-limit.service';
import { ProjectInvitation } from './project-invitation.entity';
import { ProjectInvitationsService } from './project-invitations.service';
import {
  ProjectInvitationsController,
  ProjectMembersController,
} from './project-invitations.controller';
import { ProjectInvitationRateLimitGuard } from './project-invitations.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectInvitation]),
    ProjectAccessModule,
    MailModule,
  ],
  controllers: [ProjectInvitationsController, ProjectMembersController],
  providers: [
    ProjectInvitationsService,
    SdkRateLimitService,
    ProjectInvitationRateLimitGuard,
  ],
})
export class ProjectInvitationsModule {}

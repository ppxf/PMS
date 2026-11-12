import { Module } from '@nestjs/common';
import { AuditRecordsModule } from './audit-records/audit-records.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AppConfigModule } from './config/app-config.module';
import { DatabaseModule } from './database/database.module';
import { HttpLoggingInterceptor } from './logger/http-logging.interceptor';
import { LoggerModule } from './logger/logger.module';
import { UsersModule } from './users/users.module';
import { GroupsModule } from './groups/groups.module';
import { MonitoringProjectsModule } from './monitoring-projects/monitoring-projects.module';
import { MonitoringEventsModule } from './monitoring-events/monitoring-events.module';
import { SdkRateLimitService } from './common/http/sdk-rate-limit.service';
import { SdkRateLimitGuard } from './common/http/sdk-rate-limit.guard';
import { ProjectInvitationsModule } from './project-invitations/project-invitations.module';
import { CoordinationModule } from './coordination/coordination.module';
import { AuthRateLimitGuard } from './coordination/auth-rate-limit.guard';
import { IdempotencyInterceptor } from './coordination/idempotency.interceptor';
import { ProjectAccessModule } from './project-access/project-access.module';
import { RetentionModule } from './retention/retention.module';

@Module({
  imports: [
    AppConfigModule,
    CoordinationModule,
    ProjectAccessModule,
    LoggerModule,
    DatabaseModule,
    RetentionModule,
    AuditRecordsModule,
    WorkspaceModule,
    DashboardModule,
    UsersModule,
    GroupsModule,
    MonitoringProjectsModule,
    MonitoringEventsModule,
    AuthModule,
    ProjectInvitationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    SdkRateLimitService,
    { provide: APP_GUARD, useClass: SdkRateLimitGuard },
    { provide: APP_GUARD, useClass: AuthRateLimitGuard },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}

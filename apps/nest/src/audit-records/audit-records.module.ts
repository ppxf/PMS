import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditRecord } from './audit-record.entity';
import { AuditRecordsService } from './audit-records.service';
import { AuditRecordsController } from './audit-records.controller';
import { AuditRecordsInterceptor } from './audit-records.interceptor';
@Module({
  imports: [TypeOrmModule.forFeature([AuditRecord])],
  controllers: [AuditRecordsController],
  providers: [
    AuditRecordsService,
    { provide: APP_INTERCEPTOR, useClass: AuditRecordsInterceptor },
  ],
  exports: [AuditRecordsService],
})
export class AuditRecordsModule {}

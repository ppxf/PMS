import { IsEnum } from 'class-validator';
import { MonitoringErrorIssueStatus } from '../entities/monitoring-error-issue.entity';

export class UpdateIssueStatusDto {
  @IsEnum(MonitoringErrorIssueStatus)
  status!: MonitoringErrorIssueStatus;
}

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource, LessThanOrEqual } from 'typeorm';
import {
  MonitoringErrorIssue,
  MonitoringErrorIssueResolutionReason,
  MonitoringErrorIssueStatus,
} from './entities/monitoring-error-issue.entity';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class IssueAutoResolutionService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(IssueAutoResolutionService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly dataSource: DataSource) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.runScheduledScan();
    }, ONE_HOUR_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async resolveInactiveProductionIssues(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - SEVEN_DAYS_MS);
    const result = await this.dataSource.getRepository(MonitoringErrorIssue).update(
      {
        status: MonitoringErrorIssueStatus.Unresolved,
        environment: 'production',
        lastSeenAt: LessThanOrEqual(cutoff),
      },
      {
        status: MonitoringErrorIssueStatus.Resolved,
        resolvedAt: now,
        resolutionReason:
          MonitoringErrorIssueResolutionReason.AutoInactivity,
      },
    );
    return result.affected ?? 0;
  }

  private async runScheduledScan(): Promise<void> {
    try {
      await this.resolveInactiveProductionIssues();
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.logger.error('自动解决 production 错误失败', failure.stack);
    }
  }
}

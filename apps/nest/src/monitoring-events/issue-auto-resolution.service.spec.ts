import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  MonitoringErrorIssueResolutionReason,
  MonitoringErrorIssueStatus,
} from './entities/monitoring-error-issue.entity';
import { IssueAutoResolutionService } from './issue-auto-resolution.service';

describe('IssueAutoResolutionService', () => {
  const now = new Date('2026-09-29T12:00:00.000Z');

  function fixture() {
    const update = jest.fn().mockResolvedValue({ affected: 1 });
    const dataSource = {
      getRepository: jest.fn().mockReturnValue({ update }),
    } as unknown as DataSource;
    return { service: new IssueAutoResolutionService(dataSource), update };
  }

  beforeEach(() => jest.useFakeTimers().setSystemTime(now));
  afterEach(() => jest.useRealTimers());

  it('resolves only inactive unresolved production issues after seven days', async () => {
    const { service, update } = fixture();

    await expect(service.resolveInactiveProductionIssues(now)).resolves.toBe(1);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: MonitoringErrorIssueStatus.Unresolved,
        environment: 'production',
        lastSeenAt: expect.objectContaining({
          _type: 'lessThanOrEqual',
          _value: new Date('2026-09-22T12:00:00.000Z'),
        }),
      }),
      {
        status: MonitoringErrorIssueStatus.Resolved,
        resolvedAt: now,
        resolutionReason: MonitoringErrorIssueResolutionReason.AutoInactivity,
      },
    );
  });

  it('runs hourly and stops running after module destruction', async () => {
    const { service, update } = fixture();
    service.onModuleInit();

    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(update).toHaveBeenCalledTimes(1);

    service.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('logs scheduled scan failures without creating an unhandled rejection', async () => {
    const { service, update } = fixture();
    const failure = new Error('database unavailable');
    update.mockRejectedValue(failure);
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(log).toHaveBeenCalledWith(
      '自动解决 production 错误失败',
      failure.stack,
    );
    service.onModuleDestroy();
    log.mockRestore();
  });
});

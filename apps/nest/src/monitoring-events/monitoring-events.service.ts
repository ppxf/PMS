import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { MonitoringProject } from '../monitoring-projects/entities/monitoring-project.entity';
import { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
import { IngestEnvelopeDto } from './dto/ingest-envelope.dto';
import { MonitoringErrorIssue } from './entities/monitoring-error-issue.entity';
import { MonitoringEvent } from './entities/monitoring-event.entity';
import { createErrorFingerprint, findCulprit } from './fingerprint';

@Injectable()
export class MonitoringEventsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly projects: MonitoringProjectsService,
  ) {}

  async ingest(
    projectId: string,
    publicKey: string | undefined,
    envelope: IngestEnvelopeDto,
  ): Promise<void> {
    const project = await this.projects.findForIngestion(projectId, publicKey);
    if (envelope.type === 'client_report') {
      await this.dataSource.manager.update(MonitoringProject, project.id, {
        lastSeenAt: new Date(),
      });
      return;
    }
    if (!project.errorMonitoringEnabled) {
      throw new ForbiddenException('项目未启用错误监控');
    }

    // The public controller's nested DTO guarantees an event for this variant.
    const event = envelope.event!;
    try {
      await this.dataSource.transaction(async (manager) => {
        if (await manager.findOneBy(MonitoringEvent, { id: event.eventId }))
          return;

        const receivedAt = new Date();
        const fingerprint = createErrorFingerprint({
          exceptionType: event.exception.type,
          message: event.message,
          stacktrace: event.exception.stacktrace,
          url: event.url,
        });
        const culprit =
          [...findCulprit(event.exception.stacktrace, event.url)]
            .slice(0, 512)
            .join('') || null;
        // Keep the increment inside PostgreSQL's conflict update, and leave
        // latest_event_id unset until the event exists to satisfy its FK.
        const [issue] = await manager.query<{ id: string }[]>(
          `INSERT INTO monitoring_error_issues
             (project_id, fingerprint, title, exception_type, culprit, first_seen_at, last_seen_at)
           VALUES ($1, $2, $3, $4, $5, $6, $6)
           ON CONFLICT (project_id, fingerprint) DO UPDATE SET
             event_count = monitoring_error_issues.event_count + 1,
             last_seen_at = EXCLUDED.last_seen_at,
             title = EXCLUDED.title,
             exception_type = EXCLUDED.exception_type,
             culprit = EXCLUDED.culprit,
             updated_at = now()
           RETURNING id`,
          [
            project.id,
            fingerprint,
            event.message,
            event.exception.type,
            culprit,
            receivedAt,
          ],
        );

        await manager.insert(MonitoringEvent, {
          id: event.eventId,
          projectId: project.id,
          issueId: issue.id,
          timestamp: new Date(event.timestamp),
          receivedAt,
          source: event.source,
          level: event.level,
          message: event.message,
          exceptionType: event.exception.type,
          exceptionValue: event.exception.value,
          stacktrace: event.exception.stacktrace ?? null,
          url: event.url ?? null,
          environment: event.environment ?? null,
          release: event.release ?? null,
          tags: event.tags ?? {},
        });
        await manager.update(MonitoringErrorIssue, issue.id, {
          latestEventId: event.eventId,
        });
        await manager.update(MonitoringProject, project.id, {
          lastSeenAt: receivedAt,
        });
      });
    } catch (error) {
      // A concurrent request may insert the same PK after the initial read.
      // DataSource.transaction has rolled back the issue increment by here.
      if (error instanceof QueryFailedError) {
        const driverError = error.driverError as {
          code?: string;
          constraint?: string;
        };
        if (
          driverError.code === '23505' &&
          driverError.constraint === 'monitoring_events_pkey'
        )
          return;
      }
      throw error;
    }
  }

  async listOwnedIssues(
    userId: string,
    groupSlug: string,
    projectSlug: string,
    query: { page: number; pageSize: number },
  ) {
    const project = await this.projects.findOwnedBySlug(userId, groupSlug, projectSlug);
    const [issues, total] = await this.dataSource.getRepository(MonitoringErrorIssue).findAndCount({
      where: { projectId: project.id },
      relations: { latestEvent: true },
      select: {
        id: true, title: true, exceptionType: true, culprit: true, status: true,
        eventCount: true, firstSeenAt: true, lastSeenAt: true,
        latestEvent: { environment: true, release: true },
      },
      order: { lastSeenAt: 'DESC' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    return {
      items: issues.map((issue) => this.toIssueSummary(issue)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getOwnedIssue(
    userId: string,
    groupSlug: string,
    projectSlug: string,
    issueId: string,
  ) {
    const project = await this.projects.findOwnedBySlug(userId, groupSlug, projectSlug);
    const issue = await this.dataSource.getRepository(MonitoringErrorIssue).findOne({
      where: { id: issueId, projectId: project.id },
      relations: { latestEvent: true },
      select: {
        id: true, title: true, exceptionType: true, culprit: true, status: true,
        eventCount: true, firstSeenAt: true, lastSeenAt: true,
        latestEvent: this.eventSelection(),
      },
    });
    if (!issue) throw new NotFoundException('监控错误不存在');
    const recentEvents = await this.dataSource.getRepository(MonitoringEvent).find({
      where: { issueId, projectId: project.id },
      select: this.eventSelection(),
      order: { receivedAt: 'DESC' },
      take: 20,
    });
    return {
      ...this.toIssueSummary(issue),
      latestEvent: issue.latestEvent ? this.toEvent(issue.latestEvent) : null,
      recentEvents: recentEvents.map((event) => this.toEvent(event)),
    };
  }

  private toIssueSummary(issue: MonitoringErrorIssue) {
    return {
      id: issue.id, title: issue.title, exceptionType: issue.exceptionType,
      culprit: issue.culprit, status: issue.status, eventCount: issue.eventCount,
      firstSeenAt: issue.firstSeenAt, lastSeenAt: issue.lastSeenAt,
      environment: issue.latestEvent?.environment ?? null,
      release: issue.latestEvent?.release ?? null,
    };
  }

  private eventSelection() {
    return {
      id: true, timestamp: true, receivedAt: true, source: true, level: true,
      message: true, exceptionType: true, exceptionValue: true, stacktrace: true,
      url: true, environment: true, release: true, tags: true,
    } as const;
  }

  private toEvent(event: MonitoringEvent) {
    const { id, timestamp, receivedAt, source, level, message, exceptionType,
      exceptionValue, stacktrace, url, environment, release, tags } = event;
    return { id, timestamp, receivedAt, source, level, message, exceptionType,
      exceptionValue, stacktrace, url, environment, release, tags };
  }
}

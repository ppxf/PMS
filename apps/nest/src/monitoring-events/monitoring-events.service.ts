import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { MonitoringProject } from '../monitoring-projects/entities/monitoring-project.entity';
import { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
import { IngestEnvelopeDto } from './dto/ingest-envelope.dto';
import { MonitoringErrorIssue } from './entities/monitoring-error-issue.entity';
import { MonitoringEvent } from './entities/monitoring-event.entity';
import { createErrorFingerprint, findCulprit } from './fingerprint';

export type IngressHeaders = Record<string, string | string[] | undefined>;

const contextEntryLimit = 50;
const contextKeyLimit = 128;
const contextValueLimit = 2048;
const sensitiveNameParts = [
  'authorization', 'cookie', 'set-cookie', 'token', 'session', 'password',
  'passwd', 'secret', 'credential', 'jwt', 'auth',
];

function isSensitiveName(name: string): boolean {
  const normalized = name.toLowerCase();
  return sensitiveNameParts.some((part) => normalized.includes(part));
}

function displayHeaderName(name: string): string {
  return name
    .split('-')
    .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}` : part)
    .join('-');
}

function boundedContextMap(entries: Iterable<[string, string]>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [rawKey, rawValue] of entries) {
    if (Object.keys(result).length >= contextEntryLimit) break;
    const key = [...rawKey].slice(0, contextKeyLimit).join('');
    if (!key) continue;
    result[key] = isSensitiveName(key)
      ? '[Filtered]'
      : [...rawValue].slice(0, contextValueLimit).join('');
  }
  return result;
}

function parseIngressCookies(value: string | undefined): Array<[string, string]> {
  if (!value) return [];
  return value.split(';').flatMap((part): Array<[string, string]> => {
    const separator = part.indexOf('=');
    if (separator < 0) return [];
    const key = part.slice(0, separator).trim();
    if (!key) return [];
    return [[key, part.slice(separator + 1).trim()]];
  });
}

function mergeIngressRequestContext(
  envelope: IngestEnvelopeDto,
  ingressHeaders: IngressHeaders | undefined,
): void {
  if (envelope.type !== 'event' || !ingressHeaders) return;
  const event = envelope.event!;
  const existing = event.contexts?.request;
  const incomingHeaders: Array<[string, string]> = [];
  let serializedCookies: string | undefined;

  for (const [name, rawValue] of Object.entries(ingressHeaders)) {
    if (rawValue === undefined) continue;
    const value = Array.isArray(rawValue) ? rawValue.join(', ') : rawValue;
    const normalizedName = name.toLowerCase();
    if (normalizedName === 'cookie') {
      serializedCookies = value;
      continue;
    }
    if (normalizedName === 'x-pms-key') continue;
    incomingHeaders.push([displayHeaderName(name), value]);
  }

  event.contexts ??= {};
  event.contexts.request = {
    headers: boundedContextMap([
      ...Object.entries(existing?.headers ?? {}),
      ...incomingHeaders,
    ]),
    cookies: boundedContextMap([
      ...Object.entries(existing?.cookies ?? {}),
      ...parseIngressCookies(serializedCookies),
    ]),
  };
}

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
    ingressHeaders?: IngressHeaders,
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

    mergeIngressRequestContext(envelope, ingressHeaders);

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
          tags: event.tags ?? {},
          contexts: event.contexts ? { ...event.contexts } : {},
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
        latestEvent: { environment: true },
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
    };
  }

  private eventSelection() {
    return {
      id: true, timestamp: true, receivedAt: true, source: true, level: true,
      message: true, exceptionType: true, exceptionValue: true, stacktrace: true,
      url: true, environment: true, tags: true, contexts: true,
    } as const;
  }

  private toEvent(event: MonitoringEvent) {
    const { id, timestamp, receivedAt, source, level, message, exceptionType,
      exceptionValue, stacktrace, url, environment, tags, contexts } = event;
    return { id, timestamp, receivedAt, source, level, message, exceptionType,
      exceptionValue, stacktrace, url, environment, tags, contexts };
  }
}

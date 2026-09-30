import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager, QueryFailedError } from 'typeorm';
import {
  MonitoringPlatform,
  MonitoringProject,
} from '../monitoring-projects/entities/monitoring-project.entity';
import { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
import { IngestEnvelopeDto } from './dto/ingest-envelope.dto';
import {
  MonitoringErrorIssue,
  MonitoringErrorIssueStatus,
} from './entities/monitoring-error-issue.entity';
import { MonitoringEvent } from './entities/monitoring-event.entity';
import { MonitoringEventsService } from './monitoring-events.service';

const projectId = '550e8400-e29b-41d4-a716-446655440000';
const secondProjectId = '550e8400-e29b-41d4-a716-446655440099';
const firstEventId = '550e8400-e29b-41d4-a716-446655440001';
const secondEventId = '550e8400-e29b-41d4-a716-446655440002';
const publicKey = 'public-key';
const receivedAt = new Date('2026-09-23T03:00:00.000Z');

function errorEnvelope(eventId = firstEventId): IngestEnvelopeDto {
  return {
    version: 1,
    type: 'event',
    sentAt: '2026-09-23T02:59:59.000Z',
    event: {
      eventId,
      timestamp: '2026-09-23T02:59:58.000Z',
      type: 'error',
      level: 'error',
      source: 'vue',
      message: 'Render failed',
      exception: {
        type: 'TypeError',
        value: 'Cannot render',
        stacktrace: 'TypeError: Render failed\n    at render (app.js:1:1)',
      },
      url: 'https://example.com/page',
      environment: 'production',
      tags: { component: 'App' },
      contexts: {
        request: { headers: { 'User-Agent': 'Mozilla/5.0' }, cookies: { session_id: '[Filtered]' } },
        browser: { name: 'Chrome', version: '152.0.0.0' },
      },
    },
  };
}

function clientReport(): IngestEnvelopeDto {
  return {
    version: 1,
    type: 'client_report',
    sentAt: '2026-09-23T02:59:59.000Z',
    sdk: { name: '@pms/sdk-vue', version: '0.1.0' },
  };
}

function project(id = projectId, key = publicKey): MonitoringProject {
  return Object.assign(new MonitoringProject(), {
    id,
    publicKey: key,
    groupId: '550e8400-e29b-41d4-a716-446655440090',
    name: 'Frontend',
    slug: 'frontend',
    platform: MonitoringPlatform.Vue,
    errorMonitoringEnabled: true,
    loggingEnabled: false,
    tracingEnabled: false,
    metricsEnabled: false,
    lastSeenAt: null,
    createdAt: new Date('2026-09-22T00:00:00.000Z'),
    updatedAt: new Date('2026-09-22T00:00:00.000Z'),
  });
}

type State = {
  projects: MonitoringProject[];
  events: MonitoringEvent[];
  issues: MonitoringErrorIssue[];
};
type FailureStage = 'insert' | 'latest' | 'project';
type UpdatePatch = { lastSeenAt?: Date | null; latestEventId?: string | null };

function uniqueError(constraint = 'monitoring_events_pkey') {
  return new QueryFailedError(
    'INSERT INTO monitoring_events',
    [],
    Object.assign(new Error('duplicate key'), { code: '23505', constraint }),
  );
}

// The only fake boundary is TypeORM. Transactions work on isolated copies and
// commit only on success; inserts enforce the same PK/FK order as the entities.
function fixture() {
  let state: State = {
    projects: [project(), project(secondProjectId, 'second-key')],
    events: [],
    issues: [],
  };
  const operations: string[] = [];
  let failure: { stage: FailureStage; error: Error } | undefined;
  let missDuplicateLookup = false;

  const update = (
    target: typeof MonitoringProject | typeof MonitoringErrorIssue,
    id: string,
    patch: UpdatePatch,
    draft: State,
    inTransaction: boolean,
  ) => {
    const stage = target === MonitoringProject ? 'project' : 'latest';
    operations.push(`${inTransaction ? 'transaction' : 'outside'}:${stage}`);
    if (failure?.stage === stage) throw failure.error;
    if (target === MonitoringErrorIssue) {
      if (!draft.events.some((event) => event.id === patch.latestEventId))
        throw new Error('latest_event_id FK missing');
      const issue = draft.issues.find((item) => item.id === id);
      if (!issue) throw new Error('issue missing');
      Object.assign(issue, patch);
    } else {
      const found = draft.projects.find((item) => item.id === id);
      if (!found) throw new Error('project missing');
      Object.assign(found, patch);
    }
    return Promise.resolve({ affected: 1, raw: [], generatedMaps: [] });
  };

  const repository = {
    findOne: ({ where }: { where: { id: string; publicKey?: string } }) =>
      Promise.resolve(
        state.projects.find(
          (item) =>
            item.id === where.id &&
            (where.publicKey === undefined ||
              item.publicKey === where.publicKey),
        ) ?? null,
      ),
  };
  const projects = new MonitoringProjectsService(
    repository as never,
    {} as never,
    new ConfigService(),
  );
  const dataSource = {
    manager: {
      update: (
        target: typeof MonitoringProject,
        id: string,
        patch: UpdatePatch,
      ) => update(target, id, patch, state, false),
    },
    transaction: async (run: (manager: EntityManager) => Promise<void>) => {
      const draft = structuredClone(state);
      operations.push('begin');
      const manager = {
        findOneBy: (target: typeof MonitoringEvent, where: { id: string }) => {
          if (target !== MonitoringEvent)
            throw new Error('unexpected transaction read');
          operations.push('transaction:duplicate');
          return Promise.resolve(
            missDuplicateLookup
              ? null
              : (draft.events.find((item) => item.id === where.id) ?? null),
          );
        },
        query: (
          sql: string,
          parameters: [string, string, string, string, string, string | null, Date],
        ) => {
          operations.push('transaction:upsert');
          const normalized = sql.replace(/\s+/gu, ' ').trim();
          // This database-boundary assertion catches a read-modify-write upsert,
          // a missing project conflict column, or eagerly setting latest_event_id.
          expect(normalized).toMatch(/INSERT INTO monitoring_error_issues/u);
          expect(normalized).toMatch(
            /\(project_id, environment, fingerprint, title, exception_type, culprit, first_seen_at, last_seen_at\)/u,
          );
          expect(normalized).toMatch(
            /VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$7\)/u,
          );
          expect(normalized).toMatch(
            /ON CONFLICT \(project_id, environment, fingerprint\) DO UPDATE SET/u,
          );
          expect(normalized).toMatch(
            /event_count = monitoring_error_issues\.event_count \+ 1/u,
          );
          expect(normalized).toMatch(/last_seen_at = EXCLUDED\.last_seen_at/u);
          expect(normalized).toMatch(/title = EXCLUDED\.title/u);
          expect(normalized).toMatch(
            /exception_type = EXCLUDED\.exception_type/u,
          );
          expect(normalized).toMatch(/culprit = EXCLUDED\.culprit/u);
          expect(normalized).toMatch(/status = 'unresolved'/u);
          expect(normalized).toMatch(/resolved_at = NULL/u);
          expect(normalized).toMatch(/resolution_reason = NULL/u);
          expect(normalized).toMatch(/reopened_at = CASE WHEN monitoring_error_issues\.status = 'resolved' THEN now\(\)/u);
          expect(normalized).toMatch(/reopen_count = CASE WHEN monitoring_error_issues\.status = 'resolved' THEN monitoring_error_issues\.reopen_count \+ 1/u);
          expect(normalized).toMatch(/RETURNING id/u);
          expect(normalized).not.toMatch(/latest_event_id/u);
          const [id, environment, fingerprint, title, exceptionType, culprit, seenAt] =
            parameters;
          let issue = draft.issues.find(
            (item) => item.projectId === id && item.environment === environment && item.fingerprint === fingerprint,
          );
          if (issue) {
            const wasResolved = issue.status === MonitoringErrorIssueStatus.Resolved;
            Object.assign(issue, {
              eventCount: issue.eventCount + 1,
              title,
              exceptionType,
              culprit,
              lastSeenAt: seenAt,
              status: MonitoringErrorIssueStatus.Unresolved,
              resolvedAt: null,
              resolutionReason: null,
              reopenedAt: wasResolved ? seenAt : issue.reopenedAt,
              reopenCount: wasResolved ? issue.reopenCount + 1 : issue.reopenCount,
            });
          } else {
            issue = Object.assign(new MonitoringErrorIssue(), {
              id: `issue-${draft.issues.length + 1}`,
              projectId: id,
              environment,
              fingerprint,
              title,
              exceptionType,
              culprit,
              status: MonitoringErrorIssueStatus.Unresolved,
              resolvedAt: null,
              resolutionReason: null,
              reopenedAt: null,
              reopenCount: 0,
              eventCount: 1,
              firstSeenAt: seenAt,
              lastSeenAt: seenAt,
              latestEventId: null,
              createdAt: seenAt,
              updatedAt: seenAt,
            });
            draft.issues.push(issue);
          }
          return Promise.resolve([{ id: issue.id }]);
        },
        insert: (target: typeof MonitoringEvent, value: MonitoringEvent) => {
          operations.push('transaction:insert');
          if (target !== MonitoringEvent) throw new Error('unexpected insert');
          if (failure?.stage === 'insert') throw failure.error;
          if (draft.events.some((item) => item.id === value.id))
            throw uniqueError();
          if (!draft.issues.some((item) => item.id === value.issueId))
            throw new Error('issue_id FK missing');
          draft.events.push({ ...value });
          return Promise.resolve({
            identifiers: [{ id: value.id }],
            generatedMaps: [],
            raw: [],
          });
        },
        update: (
          target: typeof MonitoringProject | typeof MonitoringErrorIssue,
          id: string,
          patch: UpdatePatch,
        ) => update(target, id, patch, draft, true),
      };
      try {
        await run(manager as unknown as EntityManager);
        state = draft;
        operations.push('commit');
      } catch (error) {
        operations.push('rollback');
        throw error;
      }
    },
  };
  return {
    service: new MonitoringEventsService(dataSource as never, projects),
    projects,
    state: () => state,
    operations,
    fail: (stage: FailureStage, error: Error) => {
      failure = { stage, error };
    },
    missDuplicate: () => {
      missDuplicateLookup = true;
    },
  };
}

describe('MonitoringEventsService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(receivedAt);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('stores two events in one issue and increments its count atomically', async () => {
    const app = fixture();
    await expect(
      app.service.ingest(projectId, publicKey, errorEnvelope()),
    ).resolves.toBeUndefined();
    jest.setSystemTime(new Date('2026-09-23T03:01:00.000Z'));
    await app.service.ingest(
      projectId,
      publicKey,
      errorEnvelope(secondEventId),
    );
    expect(app.state().events).toHaveLength(2);
    expect(app.state().issues).toHaveLength(1);
    expect(app.state().issues[0]).toMatchObject({
      eventCount: 2,
      latestEventId: secondEventId,
      title: 'Render failed',
      exceptionType: 'TypeError',
      culprit: 'at render (app.js:1:1)',
      environment: 'production',
      firstSeenAt: receivedAt,
      lastSeenAt: new Date('2026-09-23T03:01:00.000Z'),
    });
    expect(app.state().events[0]).toMatchObject({
      id: firstEventId,
      projectId,
      issueId: app.state().issues[0].id,
      timestamp: new Date('2026-09-23T02:59:58.000Z'),
      receivedAt,
      source: 'vue',
      level: 'error',
      message: 'Render failed',
      exceptionType: 'TypeError',
      exceptionValue: 'Cannot render',
      stacktrace: 'TypeError: Render failed\n    at render (app.js:1:1)',
      url: 'https://example.com/page',
      environment: 'production',
      tags: { component: 'App' },
      contexts: errorEnvelope().event!.contexts,
    });
    expect(app.state().projects[0].lastSeenAt).toEqual(
      new Date('2026-09-23T03:01:00.000Z'),
    );
    expect(app.operations.slice(0, 7)).toEqual([
      'begin',
      'transaction:duplicate',
      'transaction:upsert',
      'transaction:insert',
      'transaction:latest',
      'transaction:project',
      'commit',
    ]);
  });

  it('preserves the browser page request context without server enrichment', async () => {
    const app = fixture();
    const input = errorEnvelope();
    const expectedRequest = structuredClone(input.event!.contexts!.request);

    await app.service.ingest(projectId, publicKey, input);

    expect(app.state().events[0].contexts.request).toEqual(
      expectedRequest,
    );
  });

  it('accepts duplicate eventId without updating count, latest event or lastSeen', async () => {
    const app = fixture();
    const input = errorEnvelope();
    await app.service.ingest(projectId, publicKey, input);
    const before = structuredClone(app.state());
    jest.setSystemTime(new Date('2026-09-23T04:00:00.000Z'));
    await expect(
      app.service.ingest(projectId, publicKey, input),
    ).resolves.toBeUndefined();
    expect(app.state()).toEqual(before);
    expect(app.operations.slice(-3)).toEqual([
      'begin',
      'transaction:duplicate',
      'commit',
    ]);
  });

  it('separates different fingerprints in the same project', async () => {
    const app = fixture();
    const second = errorEnvelope(secondEventId);
    second.event!.message = 'Different failure';
    await app.service.ingest(projectId, publicKey, errorEnvelope());
    await app.service.ingest(projectId, publicKey, second);
    expect(app.state().issues).toHaveLength(2);
    expect(app.state().issues.map((issue) => issue.eventCount)).toEqual([1, 1]);
    expect(new Set(app.state().events.map((event) => event.issueId)).size).toBe(
      2,
    );
  });

  it('isolates the same fingerprint across projects', async () => {
    const app = fixture();
    await app.service.ingest(projectId, publicKey, errorEnvelope());
    await app.service.ingest(
      secondProjectId,
      'second-key',
      errorEnvelope(secondEventId),
    );
    expect(app.state().issues).toHaveLength(2);
    expect(app.state().issues.map((issue) => issue.projectId)).toEqual([
      projectId,
      secondProjectId,
    ]);
    expect(app.state().issues[0].fingerprint).toBe(
      app.state().issues[1].fingerprint,
    );
  });

  it('isolates the same fingerprint across environments', async () => {
    const app = fixture();
    const development = errorEnvelope(secondEventId);
    development.event!.environment = 'development';

    await app.service.ingest(projectId, publicKey, errorEnvelope());
    await app.service.ingest(projectId, publicKey, development);

    expect(app.state().issues).toHaveLength(2);
    expect(app.state().issues.map((item) => item.environment)).toEqual([
      'production',
      'development',
    ]);
  });

  it('records reopening when a resolved issue receives the same error again', async () => {
    const app = fixture();
    await app.service.ingest(projectId, publicKey, errorEnvelope());
    Object.assign(app.state().issues[0], {
      status: MonitoringErrorIssueStatus.Resolved,
      resolvedAt: receivedAt,
      resolutionReason: 'auto_inactivity',
    });
    jest.setSystemTime(new Date('2026-09-29T05:00:00.000Z'));

    await app.service.ingest(projectId, publicKey, errorEnvelope(secondEventId));

    expect(app.state().issues[0]).toMatchObject({
      status: MonitoringErrorIssueStatus.Unresolved,
      resolvedAt: null,
      resolutionReason: null,
      reopenedAt: new Date('2026-09-29T05:00:00.000Z'),
      reopenCount: 1,
    });
  });

  it('accepts client reports with error monitoring disabled and writes only lastSeen', async () => {
    const app = fixture();
    app.state().projects[0].errorMonitoringEnabled = false;
    await expect(
      app.service.ingest(projectId, publicKey, clientReport()),
    ).resolves.toBeUndefined();
    expect(app.state().projects[0].lastSeenAt).toEqual(receivedAt);
    expect(app.state().events).toEqual([]);
    expect(app.state().issues).toEqual([]);
    expect(app.operations).toEqual(['outside:project']);
  });

  it.each([undefined, '', '   ', 'incorrect-key'])(
    'returns the same 404 for invalid public key %p',
    async (key) => {
      const app = fixture();
      await expect(
        app.service.ingest(projectId, key, errorEnvelope()),
      ).rejects.toThrow(new NotFoundException('监控项目不存在'));
      expect(app.operations).toEqual([]);
      expect(app.state().projects[0].lastSeenAt).toBeNull();
    },
  );

  it('returns the same 404 for a missing project', async () => {
    const app = fixture();
    await expect(
      app.service.ingest(
        '550e8400-e29b-41d4-a716-446655440088',
        publicKey,
        clientReport(),
      ),
    ).rejects.toThrow(new NotFoundException('监控项目不存在'));
    expect(app.operations).toEqual([]);
  });

  it('rejects events with 403 when error monitoring is disabled', async () => {
    const app = fixture();
    app.state().projects[0].errorMonitoringEnabled = false;
    await expect(
      app.service.ingest(projectId, publicKey, errorEnvelope()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(app.operations).toEqual([]);
    expect(app.state().events).toEqual([]);
    expect(app.state().issues).toEqual([]);
    expect(app.state().projects[0].lastSeenAt).toBeNull();
  });

  it.each<FailureStage>(['insert', 'latest', 'project'])(
    'rolls back issue, event and lastSeen when %s fails',
    async (stage) => {
      const app = fixture();
      const before = structuredClone(app.state());
      const failure = new Error(`database ${stage} failure`);
      app.fail(stage, failure);
      await expect(
        app.service.ingest(projectId, publicKey, errorEnvelope()),
      ).rejects.toBe(failure);
      expect(app.state()).toEqual(before);
      expect(app.operations.at(-1)).toBe('rollback');
    },
  );

  it('treats the event PK race as idempotent only after rolling back the attempted count increment', async () => {
    const app = fixture();
    await app.service.ingest(projectId, publicKey, errorEnvelope());
    const before = structuredClone(app.state());
    app.missDuplicate();
    jest.setSystemTime(new Date('2026-09-23T04:00:00.000Z'));
    await expect(
      app.service.ingest(projectId, publicKey, errorEnvelope()),
    ).resolves.toBeUndefined();
    expect(app.state()).toEqual(before);
    expect(app.operations.slice(-5)).toEqual([
      'begin',
      'transaction:duplicate',
      'transaction:upsert',
      'transaction:insert',
      'rollback',
    ]);
  });

  it('propagates a unique violation unrelated to the event primary key', async () => {
    const app = fixture();
    const failure = uniqueError(
      'uq_monitoring_error_issues_project_fingerprint',
    );
    app.fail('insert', failure);
    await expect(
      app.service.ingest(projectId, publicKey, errorEnvelope()),
    ).rejects.toBe(failure);
    expect(app.state().events).toEqual([]);
    expect(app.state().issues).toEqual([]);
  });

  it('stores optional event fields with database defaults', async () => {
    const app = fixture();
    const input = errorEnvelope();
    delete input.event!.exception.stacktrace;
    delete input.event!.url;
    delete input.event!.environment;
    delete input.event!.tags;
    delete input.event!.contexts;
    await app.service.ingest(projectId, publicKey, input);
    expect(app.state().events[0]).toMatchObject({
      stacktrace: null,
      url: null,
      environment: null,
      tags: {},
      contexts: {},
    });
    expect(app.state().issues[0].culprit).toBeNull();
    expect(app.state().issues[0].environment).toBe('unknown');
  });

  it('truncates only stored culprit while grouping by the complete frame', async () => {
    const app = fixture();
    const first = errorEnvelope();
    const second = errorEnvelope(secondEventId);
    first.event!.exception.stacktrace = `at ${'x'.repeat(600)}1`;
    second.event!.exception.stacktrace = `at ${'x'.repeat(600)}2`;
    await app.service.ingest(projectId, publicKey, first);
    await app.service.ingest(projectId, publicKey, second);
    expect(app.state().issues).toHaveLength(2);
    expect(app.state().issues.map((issue) => issue.culprit)).toEqual([
      `at ${'x'.repeat(509)}`,
      `at ${'x'.repeat(509)}`,
    ]);
    expect(app.state().events[0].stacktrace).toHaveLength(604);
  });
});

describe('MonitoringEventsService management queries', () => {
  const issueId = '550e8400-e29b-41d4-a716-446655440010';
  const issue = Object.assign(new MonitoringErrorIssue(), {
    id: issueId,
    projectId,
    title: 'Render failed',
    exceptionType: 'TypeError',
    culprit: 'at render',
    status: MonitoringErrorIssueStatus.Unresolved,
    environment: 'production',
    resolvedAt: null,
    resolutionReason: null,
    reopenedAt: null,
    reopenCount: 0,
    eventCount: 2,
    firstSeenAt: new Date('2026-09-23T02:00:00.000Z'),
    lastSeenAt: new Date('2026-09-23T03:00:00.000Z'),
    latestEventId: secondEventId,
    latestEvent: Object.assign(new MonitoringEvent(), {
      id: secondEventId,
      source: 'vue',
      environment: 'production',
    }),
  });

  function queryFixture(options?: { foundIssue?: MonitoringErrorIssue | null }) {
    const issueRepository = {
      findAndCount: jest.fn().mockResolvedValue([[issue], 1]),
      findOne: jest.fn().mockResolvedValue(
        options && 'foundIssue' in options ? options.foundIssue : issue,
      ),
      findOneBy: jest.fn().mockResolvedValue(issue),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const recentEvents = [
      Object.assign(new MonitoringEvent(), {
        id: secondEventId,
        projectId,
        issueId,
        timestamp: new Date('2026-09-23T02:59:58.000Z'),
        receivedAt: new Date('2026-09-23T03:00:00.000Z'),
        source: 'vue', level: 'error', message: 'Render failed',
        exceptionType: 'TypeError', exceptionValue: 'Cannot render',
        stacktrace: 'stack', url: 'https://example.com',
        environment: 'production', tags: { component: 'App' },
        contexts: { browser: { name: 'Chrome' } },
      }),
    ];
    const eventRepository = { find: jest.fn().mockResolvedValue(recentEvents) };
    const projects = {
      findOwnedBySlug: jest.fn().mockResolvedValue({ id: projectId }),
    };
    const dataSource = {
      getRepository: jest.fn((target) =>
        target === MonitoringErrorIssue ? issueRepository : eventRepository,
      ),
    };
    return {
      service: new MonitoringEventsService(dataSource as never, projects as never),
      issueRepository, eventRepository, projects, recentEvents,
    };
  }

  it('scopes, paginates and sorts issue summaries with latest event metadata', async () => {
    const app = queryFixture();
    await expect(
      app.service.listOwnedIssues('user-1', 'acme', 'web', { page: 2, pageSize: 10 }),
    ).resolves.toEqual({
      items: [{
        id: issueId, title: 'Render failed', exceptionType: 'TypeError',
        culprit: 'at render', status: 'unresolved', eventCount: 2,
        firstSeenAt: new Date('2026-09-23T02:00:00.000Z'),
        lastSeenAt: new Date('2026-09-23T03:00:00.000Z'),
        source: 'vue',
        environment: 'production', resolvedAt: null, resolutionReason: null,
        reopenedAt: null, reopenCount: 0,
      }],
      total: 1, page: 2, pageSize: 10,
    });
    expect(app.projects.findOwnedBySlug).toHaveBeenCalledWith('user-1', 'acme', 'web');
    expect(app.issueRepository.findAndCount).toHaveBeenCalledWith(expect.objectContaining({
      where: { projectId }, skip: 10, take: 10, order: { lastSeenAt: 'DESC' },
      relations: { latestEvent: true },
    }));
  });

  it('returns a scoped issue detail and twenty newest project events', async () => {
    const app = queryFixture();
    await expect(
      app.service.getOwnedIssue('user-1', 'acme', 'web', issueId),
    ).resolves.toMatchObject({
      id: issueId,
      latestEvent: { id: secondEventId },
      recentEvents: [{ id: secondEventId, exceptionValue: 'Cannot render' }],
    });
    expect(app.issueRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: issueId, projectId }, relations: { latestEvent: true },
    }));
    expect(app.eventRepository.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { issueId, projectId }, take: 20, order: { receivedAt: 'DESC' },
    }));
  });

  it('manually resolves and reopens an owned issue with audit metadata', async () => {
    const app = queryFixture();
    jest.useFakeTimers().setSystemTime(new Date('2026-09-29T06:00:00.000Z'));

    await app.service.updateOwnedIssueStatus(
      'user-1', 'acme', 'web', issueId, MonitoringErrorIssueStatus.Resolved,
    );
    expect(app.issueRepository.update).toHaveBeenNthCalledWith(1, issueId, {
      status: MonitoringErrorIssueStatus.Resolved,
      resolvedAt: new Date('2026-09-29T06:00:00.000Z'),
      resolutionReason: 'manual',
    });

    await app.service.updateOwnedIssueStatus(
      'user-1', 'acme', 'web', issueId, MonitoringErrorIssueStatus.Unresolved,
    );
    expect(app.issueRepository.update).toHaveBeenNthCalledWith(2, issueId, {
      status: MonitoringErrorIssueStatus.Unresolved,
      resolvedAt: null,
      resolutionReason: null,
      reopenedAt: new Date('2026-09-29T06:00:00.000Z'),
      reopenCount: expect.any(Function),
    });
    jest.useRealTimers();
  });

  it('uses the same 404 for a missing or cross-project issue', async () => {
    const app = queryFixture({ foundIssue: null });
    await expect(
      app.service.getOwnedIssue('user-2', 'other', 'web', issueId),
    ).rejects.toThrow(new NotFoundException('监控错误不存在'));
    expect(app.eventRepository.find).not.toHaveBeenCalled();
  });
});

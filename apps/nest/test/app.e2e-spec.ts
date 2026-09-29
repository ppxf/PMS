import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request, { Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { UserStatus } from './../src/users/entities/user.entity';
import { UsersService } from './../src/users/users.service';
import { GroupsService } from './../src/groups/groups.service';
import { MonitoringProjectsService } from './../src/monitoring-projects/monitoring-projects.service';
import { MonitoringEventsService } from './../src/monitoring-events/monitoring-events.service';
import { createErrorFingerprint } from './../src/monitoring-events/fingerprint';

const GROUP_ID = '10000000-0000-4000-8000-000000000001';
const PROJECT_ID = '20000000-0000-4000-8000-000000000001';

interface TestGroup {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  projectCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface TestProject {
  id: string;
  groupId: string;
  name: string;
  slug: string;
  platform: 'vue';
  publicKey: string;
  errorMonitoringEnabled: boolean;
  loggingEnabled: boolean;
  tracingEnabled: boolean;
  metricsEnabled: boolean;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type TestProjectResponse = TestProject & { connected: boolean; dsn: string };

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let passwordHash: string;
  let testProjects: TestProject[];
  let testIssues: Array<Record<string, any>>;
  let testEvents: Array<Record<string, any>>;

  beforeEach(async () => {
    passwordHash = await bcrypt.hash('password123', 4);
    const users = [
      {
      id: 'user-1',
      email: 'admin@example.com',
      name: '用户一',
      passwordHash,
      status: UserStatus.Active,
      permissions: ['user:read'],
      },
      {
        id: 'user-2',
        email: 'second@example.com',
        name: '用户二',
        passwordHash,
        status: UserStatus.Active,
        permissions: [],
      },
    ];
    const groups: TestGroup[] = [];
    const projects: TestProject[] = [];
    testProjects = projects;
    const groupsService = {
      create: jest.fn((ownerId: string, input: { name: string }) => {
        const now = new Date();
        const group: TestGroup = {
          id: GROUP_ID,
          ownerId,
          name: input.name.trim(),
          slug: input.name.trim().toLowerCase().replace(/\s+/g, '-'),
          projectCount: 0,
          createdAt: now,
          updatedAt: now,
        };
        groups.push(group);
        return Promise.resolve(group);
      }),
      listOwned: jest.fn((ownerId: string) =>
        Promise.resolve(groups.filter((group) => group.ownerId === ownerId)),
      ),
      findOwnedBySlug: jest.fn((ownerId: string, slug: string) => {
        const group = groups.find(
          (item) => item.ownerId === ownerId && item.slug === slug,
        );
        if (!group) throw new NotFoundException('组不存在');
        return Promise.resolve(group);
      }),
    };
    const toProjectResponse = (project: TestProject): TestProjectResponse => ({
      ...project,
      connected: Boolean(project.lastSeenAt),
      dsn: `http://${project.publicKey}@localhost:3001/api/sdk/${project.id}`,
    });
    const findOwnedProject = async (
      userId: string,
      groupSlug: string,
      projectSlug: string,
    ): Promise<TestProjectResponse> => {
      const group = await groupsService.findOwnedBySlug(userId, groupSlug);
      const project = projects.find(
        (item) => item.groupId === group.id && item.slug === projectSlug,
      );
      if (!project) throw new NotFoundException('监控项目不存在');
      return toProjectResponse(project);
    };
    const projectsService = {
      create: jest.fn(
        async (
          userId: string,
          groupSlug: string,
          input: Omit<TestProject, 'id' | 'groupId' | 'publicKey'>,
        ) => {
          const group = await groupsService.findOwnedBySlug(userId, groupSlug);
          const now = new Date();
          const project: TestProject = {
            id: PROJECT_ID,
            groupId: group.id,
            name: input.name.trim(),
            slug: input.name.trim().toLowerCase().replace(/\s+/g, '-'),
            platform: 'vue',
            publicKey: 'local-public-key',
            errorMonitoringEnabled: input.errorMonitoringEnabled ?? true,
            loggingEnabled: input.loggingEnabled ?? false,
            tracingEnabled: input.tracingEnabled ?? false,
            metricsEnabled: input.metricsEnabled ?? false,
            lastSeenAt: null,
            createdAt: now,
            updatedAt: now,
          };
          projects.push(project);
          return toProjectResponse(project);
        },
      ),
      listOwned: jest.fn(async (userId: string, groupSlug: string) => {
        const group = await groupsService.findOwnedBySlug(userId, groupSlug);
        return projects
          .filter((project) => project.groupId === group.id)
          .map(toProjectResponse);
      }),
      findOwnedBySlug: jest.fn(findOwnedProject),
      getConnection: jest.fn(
        async (
          userId: string,
          groupSlug: string,
          projectSlug: string,
        ): Promise<{ connected: boolean; lastSeenAt: Date | null }> => {
          const project = await findOwnedProject(userId, groupSlug, projectSlug);
          return { connected: project.connected, lastSeenAt: project.lastSeenAt };
        },
      ),
      checkConnection: jest.fn((projectId: string, publicKey: string) => {
        const project = projects.find(
          (item) => item.id === projectId && item.publicKey === publicKey,
        );
        if (!project) throw new NotFoundException('监控项目不存在');
        project.lastSeenAt = new Date();
        return Promise.resolve({
          projectId: project.id,
          platform: project.platform,
          checkedAt: project.lastSeenAt,
        });
      }),
    };
    const issues: Array<Record<string, any>> = [];
    const events: Array<Record<string, any>> = [];
    testIssues = issues;
    testEvents = events;
    const toEventResponse = (event: Record<string, any>) => ({
      id: event.id, timestamp: event.timestamp, receivedAt: event.receivedAt,
      source: event.source, level: event.level, message: event.message,
      exceptionType: event.exceptionType, exceptionValue: event.exceptionValue,
      stacktrace: event.stacktrace, url: event.url, environment: event.environment,
      tags: event.tags, contexts: event.contexts,
    });
    const eventsService = {
      ingest: jest.fn((id: string, key: string | undefined, envelope: any) => {
        const project = projects.find((item) => item.id === id && item.publicKey === key);
        if (!project) throw new NotFoundException('监控项目不存在');
        const receivedAt = new Date();
        if (envelope.type === 'client_report') {
          project.lastSeenAt = receivedAt;
          return;
        }
        if (!project.errorMonitoringEnabled)
          throw new ForbiddenException('项目未启用错误监控');
        if (events.some((item) => item.id === envelope.event.eventId)) return;
        const event = envelope.event;
        const fingerprint = createErrorFingerprint({
          exceptionType: event.exception.type,
          message: event.message,
          stacktrace: event.exception.stacktrace,
          url: event.url,
        });
        let issue = issues.find((item) => item.projectId === id && item.fingerprint === fingerprint);
        if (!issue) {
          issue = {
            id: '30000000-0000-4000-8000-000000000001', projectId: id, fingerprint,
            title: event.message, exceptionType: event.exception.type, culprit: 'at render',
            status: 'unresolved', eventCount: 0, firstSeenAt: receivedAt,
            lastSeenAt: receivedAt, latestEventId: null,
          };
          issues.push(issue);
        }
        issue.eventCount += 1;
        issue.lastSeenAt = receivedAt;
        const stored = {
          id: event.eventId, projectId: id, issueId: issue.id,
          timestamp: new Date(event.timestamp), receivedAt, source: event.source,
          level: event.level, message: event.message,
          exceptionType: event.exception.type, exceptionValue: event.exception.value,
          stacktrace: event.exception.stacktrace ?? null, url: event.url ?? null,
          environment: event.environment ?? null, tags: event.tags ?? {},
          contexts: event.contexts ?? {},
        };
        events.push(stored);
        issue.latestEventId = stored.id;
        project.lastSeenAt = receivedAt;
      }),
      listOwnedIssues: jest.fn(async (userId: string, groupSlug: string, projectSlug: string, query: any) => {
        const project = await findOwnedProject(userId, groupSlug, projectSlug);
        const scoped = issues
          .filter((item) => item.projectId === project.id)
          .sort((first, second) => second.lastSeenAt.getTime() - first.lastSeenAt.getTime());
        const pageItems = scoped.slice(
          (query.page - 1) * query.pageSize,
          query.page * query.pageSize,
        );
        return {
          items: pageItems.map((issue) => {
            const latest = events.find((event) => event.id === issue.latestEventId);
            return {
              id: issue.id, title: issue.title, exceptionType: issue.exceptionType,
              culprit: issue.culprit, status: issue.status, eventCount: issue.eventCount,
              firstSeenAt: issue.firstSeenAt, lastSeenAt: issue.lastSeenAt,
              environment: latest?.environment ?? null,
            };
          }),
          total: scoped.length, page: query.page, pageSize: query.pageSize,
        };
      }),
      getOwnedIssue: jest.fn(async (userId: string, groupSlug: string, projectSlug: string, issueId: string) => {
        const project = await findOwnedProject(userId, groupSlug, projectSlug);
        const issue = issues.find((item) => item.id === issueId && item.projectId === project.id);
        if (!issue) throw new NotFoundException('监控错误不存在');
        const recentEvents = events.filter((event) => event.issueId === issue.id && event.projectId === project.id)
          .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime()).slice(0, 20);
        const latestEvent = events.find((event) => event.id === issue.latestEventId);
        return {
          id: issue.id, title: issue.title, exceptionType: issue.exceptionType,
          culprit: issue.culprit, status: issue.status, eventCount: issue.eventCount,
          firstSeenAt: issue.firstSeenAt, lastSeenAt: issue.lastSeenAt,
          environment: latestEvent?.environment ?? null,
          latestEvent: latestEvent ? toEventResponse(latestEvent) : null,
          recentEvents: recentEvents.map(toEventResponse),
        };
      }),
    };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(UsersService)
      .useValue({
        findActiveById: jest.fn((id: string) =>
          Promise.resolve(users.find((user) => user.id === id) ?? null),
        ),
        findByEmail: jest.fn((email: string) =>
          Promise.resolve(
            users.find(
              (user) => user.email === email.trim().toLowerCase(),
            ) ?? null,
          ),
        ),
      })
      .overrideProvider(GroupsService)
      .useValue(groupsService)
      .overrideProvider(MonitoringProjectsService)
      .useValue(projectsService)
      .overrideProvider(MonitoringEventsService)
      .useValue(eventsService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      }),
    );
    await app.init();
  });

  it('rejects a protected endpoint without a token', () => {
    return request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('validates public registration input', () => {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'invalid-email', password: 'short' })
      .expect(400);
  });

  it('logs in and returns the current user with the issued token', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'password123' })
      .expect(201);
    const body = login.body as { data: { accessToken: string } };

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${body.data.accessToken}`)
      .expect(200)
      .expect((response: Response) => {
        expect(response.body).toMatchObject({
          success: true,
          data: {
            user: { id: 'user-1', email: 'admin@example.com' },
            permissions: ['user:read'],
          },
        });
      });
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect((response: Response) => {
        const body = response.body as {
          success: boolean;
          data: { status: string };
        };

        expect(body.success).toBe(true);
        expect(body.data.status).toBe('ok');
      });
  });

  it('creates an owned group and project, validates its DSN, and hides it from another user', async () => {
    const ownerLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'password123' })
      .expect(201);
    const ownerToken = (ownerLogin.body as { data: { accessToken: string } })
      .data.accessToken;
    const otherLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'second@example.com', password: 'password123' })
      .expect(201);
    const otherToken = (otherLogin.body as { data: { accessToken: string } })
      .data.accessToken;

    await request(app.getHttpServer())
      .post('/groups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Acme Team' })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/groups/acme-team/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Vue Storefront',
        platform: 'vue',
        errorMonitoringEnabled: true,
        loggingEnabled: false,
        tracingEnabled: true,
        metricsEnabled: false,
      })
      .expect(201);
    const project = created.body.data as {
      id: string;
      slug: string;
      dsn: string;
    };
    const dsn = new URL(project.dsn);

    await request(app.getHttpServer())
      .post('/sdk/check')
      .send({ projectId: project.id, publicKey: dsn.username })
      .expect(200)
      .expect((response: Response) => {
        expect(response.body.data).toMatchObject({
          projectId: PROJECT_ID,
          platform: 'vue',
        });
      });

    await request(app.getHttpServer())
      .get(`/groups/acme-team/projects/${project.slug}/connection`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((response: Response) => {
        expect(response.body.data.connected).toBe(true);
        expect(response.body.data.lastSeenAt).toBeTruthy();
      });

    await request(app.getHttpServer())
      .get('/groups/acme-team')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
  });

  it('ingests public envelopes and exposes project-scoped issue queries', async () => {
    const login = async (email: string) => {
      const response = await request(app.getHttpServer()).post('/auth/login')
        .send({ email, password: 'password123' }).expect(201);
      return (response.body as { data: { accessToken: string } }).data.accessToken;
    };
    const ownerToken = await login('admin@example.com');
    const otherToken = await login('second@example.com');
    await request(app.getHttpServer()).post('/groups').set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Acme Team' }).expect(201);
    const created = await request(app.getHttpServer()).post('/groups/acme-team/projects')
      .set('Authorization', `Bearer ${ownerToken}`).send({ name: 'Web', platform: 'vue' }).expect(201);
    const project = (created.body as { data: TestProjectResponse }).data;
    const baseEnvelope = {
      version: 1, type: 'event', sentAt: '2026-09-23T02:59:59.000Z',
      event: {
        eventId: '40000000-0000-4000-8000-000000000001',
        timestamp: '2026-09-23T02:59:58.000Z', type: 'error', level: 'error', source: 'vue',
        message: 'Render failed', exception: { type: 'TypeError', value: 'Cannot render', stacktrace: 'at render' },
        url: 'https://shop.example.com', environment: 'production', tags: { component: 'App' },
        contexts: {
          request: { headers: { 'User-Agent': 'Mozilla/5.0' }, cookies: { session_id: '[Filtered]' } },
          browser: { name: 'Chrome', version: '152.0.0.0' },
          memory: { usedJSHeapSize: 1048576 },
        },
      },
    };
    await request(app.getHttpServer()).post(`/sdk/${project.id}/envelope`)
      .set('X-PMS-Key', project.publicKey).send({
        version: 1,
        type: 'client_report',
        sentAt: baseEnvelope.sentAt,
        sdk: { name: '@pms/sdk-vue', version: '0.1.0' },
      }).expect(202);
    await request(app.getHttpServer()).get('/groups/acme-team/projects/web/connection')
      .set('Authorization', `Bearer ${ownerToken}`).expect(200)
      .expect((response: Response) => expect(response.body.data.connected).toBe(true));
    await request(app.getHttpServer()).post(`/sdk/${project.id}/envelope`)
      .set('X-PMS-Key', project.publicKey).send(baseEnvelope).expect(202);
    await request(app.getHttpServer()).post(`/sdk/${project.id}/envelope`)
      .set('X-PMS-Key', project.publicKey)
      .send({ ...baseEnvelope, event: { ...baseEnvelope.event, eventId: '40000000-0000-4000-8000-000000000002' } }).expect(202);
    const list = await request(app.getHttpServer()).get('/groups/acme-team/projects/web/issues')
      .set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(list.body.data).toMatchObject({ total: 1, page: 1, pageSize: 20, items: [{ eventCount: 2, environment: 'production' }] });
    expect(list.body.data.items[0]).not.toHaveProperty('release');
    const issueId = list.body.data.items[0].id as string;
    await request(app.getHttpServer()).get(`/groups/acme-team/projects/web/issues/${issueId}`)
      .set('Authorization', `Bearer ${ownerToken}`).expect(200)
      .expect((response: Response) => {
        expect(response.body.data).toMatchObject({
          id: issueId,
          latestEvent: { contexts: baseEnvelope.event.contexts },
        });
        expect(response.body.data.recentEvents).toHaveLength(2);
        expect(response.body.data.recentEvents[0]).toMatchObject({
          id: '40000000-0000-4000-8000-000000000002',
          exceptionType: 'TypeError',
          environment: 'production',
        });
        expect(response.body.data.recentEvents[0]).not.toHaveProperty('projectId');
        expect(response.body.data.recentEvents[0]).not.toHaveProperty('issueId');
      });
    await request(app.getHttpServer()).get(`/groups/acme-team/projects/web/issues/${issueId}`)
      .set('Authorization', `Bearer ${otherToken}`).expect(404);
    await request(app.getHttpServer()).post(`/sdk/${project.id}/envelope`)
      .set('X-PMS-Key', project.publicKey).send({ version: 1, type: 'event' }).expect(400);
    await request(app.getHttpServer()).post(`/sdk/${project.id}/envelope`)
      .set('X-PMS-Key', 'wrong-key').send(baseEnvelope).expect(404);
    const storedProject = testProjects.find((item) => item.id === project.id)!;
    storedProject.errorMonitoringEnabled = false;
    await request(app.getHttpServer()).post(`/sdk/${project.id}/envelope`)
      .set('X-PMS-Key', project.publicKey)
      .send({ ...baseEnvelope, event: { ...baseEnvelope.event, eventId: '40000000-0000-4000-8000-000000000003' } }).expect(403);
  });

  it('mirrors production issue sorting, pagination and nullable latest events', async () => {
    const login = await request(app.getHttpServer()).post('/auth/login')
      .send({ email: 'admin@example.com', password: 'password123' }).expect(201);
    const token = (login.body as { data: { accessToken: string } }).data.accessToken;
    await request(app.getHttpServer()).post('/groups')
      .set('Authorization', `Bearer ${token}`).send({ name: 'Acme Team' }).expect(201);
    await request(app.getHttpServer()).post('/groups/acme-team/projects')
      .set('Authorization', `Bearer ${token}`).send({ name: 'Web', platform: 'vue' }).expect(201);

    for (let index = 0; index < 11; index += 1) {
      const suffix = String(index + 1).padStart(12, '0');
      const issueId = `30000000-0000-4000-8000-${suffix}`;
      const eventId = `40000000-0000-4000-8000-${suffix}`;
      const receivedAt = new Date(`2026-09-23T03:${String(index).padStart(2, '0')}:00.000Z`);
      testIssues.push({
        id: issueId, projectId: PROJECT_ID, fingerprint: `fingerprint-${index}`,
        title: `Issue ${index}`, exceptionType: 'Error', culprit: null,
        status: 'unresolved', eventCount: 1, firstSeenAt: receivedAt,
        lastSeenAt: receivedAt, latestEventId: eventId,
      });
      testEvents.push({
        id: eventId, projectId: PROJECT_ID, issueId, timestamp: receivedAt,
        receivedAt, source: 'vue', level: 'error', message: `Issue ${index}`,
        exceptionType: 'Error', exceptionValue: `Issue ${index}`,
        stacktrace: null, url: null, environment: `env-${index}`,
        tags: {}, contexts: {},
      });
    }

    const secondPage = await request(app.getHttpServer())
      .get('/groups/acme-team/projects/web/issues?page=2&pageSize=10')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(secondPage.body.data).toMatchObject({ total: 11, page: 2, pageSize: 10 });
    expect(secondPage.body.data.items).toHaveLength(1);
    expect(secondPage.body.data.items[0]).toMatchObject({ title: 'Issue 0', environment: 'env-0' });

    const nullableIssueId = '30000000-0000-4000-8000-999999999999';
    testIssues.push({
      id: nullableIssueId, projectId: PROJECT_ID, fingerprint: 'without-latest',
      title: 'No latest event', exceptionType: 'Error', culprit: null,
      status: 'unresolved', eventCount: 0,
      firstSeenAt: new Date('2026-09-23T01:00:00.000Z'),
      lastSeenAt: new Date('2026-09-23T01:00:00.000Z'), latestEventId: null,
    });
    const nullableList = await request(app.getHttpServer())
      .get('/groups/acme-team/projects/web/issues?page=2&pageSize=10')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(nullableList.body.data.items[1]).toMatchObject({
      id: nullableIssueId, environment: null,
    });
    await request(app.getHttpServer())
      .get(`/groups/acme-team/projects/web/issues/${nullableIssueId}`)
      .set('Authorization', `Bearer ${token}`).expect(200)
      .expect((response: Response) => {
        expect(response.body.data.latestEvent).toBeNull();
        expect(response.body.data.recentEvents).toEqual([]);
      });
  });

  afterEach(async () => {
    await app.close();
  });
});

import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { MonitoringProjectsController } from './monitoring-projects.controller';
import { MonitoringProjectsService } from './monitoring-projects.service';

describe('Project error monitoring switch HTTP', () => {
  let app: NestExpressApplication;
  const initialProject = {
    id: 'project-1',
    groupId: 'group-1',
    name: 'Frontend',
    slug: 'frontend',
    platform: 'vue',
    errorMonitoringEnabled: true,
    loggingEnabled: false,
    tracingEnabled: false,
    metricsEnabled: false,
    propagationTargets: [],
    reportedPropagationTargets: [],
    allowedOrigins: ['*'],
    publicKey: 'key',
    lastSeenAt: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
  };
  let stored = { ...initialProject };
  const endpoint = '/groups/acme/projects/frontend/error-monitoring';

  beforeAll(async () => {
    const repository = {
      findOne: ({ where }: { where: { groupId: string; slug: string } }) =>
        Promise.resolve(
          where.groupId === stored.groupId && where.slug === stored.slug
            ? { ...stored }
            : null,
        ),
      update: (id: string, changes: Partial<typeof stored>) => {
        if (id === stored.id) stored = { ...stored, ...changes };
        return Promise.resolve();
      },
    };
    const groups = {
      findOwnedBySlug: (userId: string, slug: string) => {
        if (userId !== 'owner' || slug !== 'acme')
          return Promise.reject(new NotFoundException());
        return Promise.resolve({ id: 'group-1', slug: 'acme' });
      },
    };
    const module = await Test.createTestingModule({
      controllers: [MonitoringProjectsController],
      providers: [
        {
          provide: MonitoringProjectsService,
          useValue: new MonitoringProjectsService(
            repository as never,
            groups as never,
            new ConfigService(),
          ),
        },
      ],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    app.use(
      (
        req: Request & { user?: { id: string } },
        _res: Response,
        next: NextFunction,
      ) => {
        req.user = { id: req.header('X-Test-User') ?? 'owner' };
        next();
      },
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    stored = { ...initialProject };
  });

  // A missing update, a hardcoded boolean, or a partial response breaks these cases.
  it.each([false, true])(
    'persists errorMonitoringEnabled=%s and returns the project',
    async (enabled) => {
      stored.errorMonitoringEnabled = !enabled;
      const result = await request(app.getHttpServer())
        .patch(endpoint)
        .send({ errorMonitoringEnabled: enabled })
        .expect(200);
      expect(result.body).toMatchObject({
        id: 'project-1',
        errorMonitoringEnabled: enabled,
        loggingEnabled: false,
        tracingEnabled: false,
        metricsEnabled: false,
        connected: false,
        dsn: 'http://key@localhost:3000/api/sdk/project-1',
      });
      const detail = await request(app.getHttpServer())
        .get('/groups/acme/projects/frontend')
        .expect(200);
      expect(detail.body.errorMonitoringEnabled).toBe(enabled);
    },
  );

  // Removing ownership or project scoping would allow these writes.
  it('rejects another owner without changing the project', async () => {
    await request(app.getHttpServer())
      .patch(endpoint)
      .set('X-Test-User', 'other')
      .send({ errorMonitoringEnabled: false })
      .expect(404);
    expect(stored.errorMonitoringEnabled).toBe(true);
  });
  it('rejects a project outside the requested group', async () => {
    stored.groupId = 'another-group';
    await request(app.getHttpServer())
      .patch(endpoint)
      .send({ errorMonitoringEnabled: false })
      .expect(404);
    expect(stored.errorMonitoringEnabled).toBe(true);
  });

  // Coercion, missing validation, or accepting extra fields breaks these cases.
  it.each([
    {},
    { errorMonitoringEnabled: 'false' },
    { errorMonitoringEnabled: 0 },
    { errorMonitoringEnabled: null },
    { errorMonitoringEnabled: false, loggingEnabled: true },
    [],
  ])('rejects invalid switch input %j without writing', async (body) => {
    await request(app.getHttpServer()).patch(endpoint).send(body).expect(400);
    expect(stored.errorMonitoringEnabled).toBe(true);
  });
});

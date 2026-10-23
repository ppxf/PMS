/* eslint-disable @typescript-eslint/require-await -- In-memory adapters model asynchronous database calls. */
import { ForbiddenException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SdkRateLimitGuard } from '../common/http/sdk-rate-limit.guard';
import { SdkRateLimitService } from '../common/http/sdk-rate-limit.service';
import { GroupsService } from '../groups/groups.service';
import { MonitoringEventsService } from '../monitoring-events/monitoring-events.service';
import { SdkEnvelopeController } from '../monitoring-events/sdk-envelope.controller';
import { MonitoringProject } from '../monitoring-projects/entities/monitoring-project.entity';
import { MonitoringProjectsController } from '../monitoring-projects/monitoring-projects.controller';
import { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
import { UsersService } from '../users/users.service';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { profileEnvelope, profileQuery } from './profiles-test.fixture';

describe('Profiles HTTP boundaries', () => {
  let app: NestExpressApplication;
  let project: any;
  const id = '550e8400-e29b-41d4-a716-446655440000';
  const sdk = `/sdk/${id}/envelope`,
    path = '/groups/team/projects/project/profiles';
  const records = new Map<string, any>();
  const repository = {
    findOneBy: async (where: any) =>
      records.get(`${where.projectId}:${where.profileId}`) ?? null,
    insert: async (value: any) => {
      records.set(`${value.projectId}:${value.profileId}`, value);
    },
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        SdkEnvelopeController,
        ProfilesController,
        MonitoringProjectsController,
      ],
      providers: [
        ProfilesService,
        MonitoringProjectsService,
        SdkRateLimitService,
        { provide: APP_GUARD, useClass: SdkRateLimitGuard },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            app: { apiPrefix: '' },
            monitoring: { sdkRateLimitPerMinute: 100 },
          }),
        },
        {
          provide: JwtService,
          useValue: { verifyAsync: async (token: string) => ({ sub: token }) },
        },
        {
          provide: UsersService,
          useValue: {
            findActiveById: async (user: string) => ({
              id: user,
              name: user,
              email: 'a@b.test',
              permissions: [],
            }),
          },
        },
        {
          provide: GroupsService,
          useValue: {
            findOwnedBySlug: async (user: string) => {
              if (user !== 'owner') throw new ForbiddenException();
              return { id: 'group' };
            },
          },
        },
        {
          provide: getRepositoryToken(MonitoringProject),
          useValue: {
            findOne: async ({ where }: any) => {
              if (
                (where.id && where.id !== id) ||
                (where.publicKey && where.publicKey !== 'key')
              )
                return null;
              if (where.slug && where.slug !== 'project')
                return {
                  ...project,
                  id: '550e8400-e29b-41d4-a716-446655440099',
                };
              return project;
            },
            update: async (_: string, value: any) =>
              Object.assign(project, value),
          },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: async (...args: any[]) =>
              args.at(-1)({
                getRepository: () => repository,
                query: async (sql: string) =>
                  sql.includes('count(*)') ? [{ total: 0 }] : [],
              }),
          },
        },
        { provide: MonitoringEventsService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    records.clear();
    project = {
      id,
      groupId: 'group',
      slug: 'project',
      publicKey: 'key',
      profilesEnabled: false,
      tracingEnabled: true,
      loggingEnabled: true,
      allowedOrigins: ['https://allowed.test'],
      lastSeenAt: null,
    };
  });
  it('defaults to disabled, requires SDK key, and rejects forbidden origins and malformed data', async () => {
    await request(app.getHttpServer())
      .post(sdk)
      .set('X-PMS-Key', 'bad')
      .send(profileEnvelope())
      .expect(404);
    await request(app.getHttpServer())
      .post(sdk)
      .send(profileEnvelope())
      .expect(404);
    await request(app.getHttpServer())
      .post(sdk)
      .set('X-PMS-Key', 'key')
      .send(profileEnvelope())
      .expect(403);
    project.profilesEnabled = true;
    await request(app.getHttpServer())
      .post(sdk)
      .set('X-PMS-Key', 'key')
      .set('Origin', 'https://denied.test')
      .send(profileEnvelope())
      .expect(403);
    const malformed = profileEnvelope();
    Object.assign(malformed.profile.samples[0], { stackId: '0' });
    await request(app.getHttpServer())
      .post(sdk)
      .set('X-PMS-Key', 'key')
      .send(malformed)
      .expect(400);
    expect(records.size).toBe(0);
  });
  it('accepts retries and returns 409 for reused profile IDs with changed content', async () => {
    project.profilesEnabled = true;
    const input = profileEnvelope();
    for (let n = 0; n < 2; n++)
      await request(app.getHttpServer())
        .post(sdk)
        .set('X-PMS-Key', 'key')
        .set('Origin', 'https://allowed.test')
        .send(input)
        .expect(202);
    input.profile.name = 'changed';
    await request(app.getHttpServer())
      .post(sdk)
      .set('X-PMS-Key', 'key')
      .send(input)
      .expect(409);
    expect(records.size).toBe(1);
  });
  it('authenticates query/config/PATCH and isolates profile detail across owners and projects', async () => {
    for (const target of [
      `${path}/config`,
      `${path}/${profileEnvelope().profile.profileId}`,
    ])
      await request(app.getHttpServer()).get(target).expect(401);
    await request(app.getHttpServer())
      .post(`${path}/query`)
      .send(profileQuery())
      .expect(401);
    await request(app.getHttpServer())
      .patch(path)
      .send({ profilesEnabled: true })
      .expect(401);
    await request(app.getHttpServer())
      .patch(path)
      .set('Authorization', 'Bearer stranger')
      .send({ profilesEnabled: true })
      .expect(403);
    await request(app.getHttpServer())
      .patch(path)
      .set('Authorization', 'Bearer owner')
      .send({ profilesEnabled: 'true' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(path)
      .set('Authorization', 'Bearer owner')
      .send({ profilesEnabled: true })
      .expect(200)
      .expect(({ body }) => expect(body.profilesEnabled).toBe(true));
    await request(app.getHttpServer())
      .get(`${path}/config`)
      .set('Authorization', 'Bearer owner')
      .expect(200)
      .expect(({ body }) => expect(body.enabled).toBe(true));
    const input = profileEnvelope();
    await request(app.getHttpServer())
      .post(sdk)
      .set('X-PMS-Key', 'key')
      .send(input)
      .expect(202);
    const detail = `${path}/${input.profile.profileId}`;
    await request(app.getHttpServer())
      .get(detail)
      .set('Authorization', 'Bearer owner')
      .expect(200)
      .expect(({ body }) => expect(body).toEqual(input.profile));
    await request(app.getHttpServer())
      .get(detail)
      .set('Authorization', 'Bearer stranger')
      .expect(403);
    await request(app.getHttpServer())
      .get(detail.replace('/project/', '/other/'))
      .set('Authorization', 'Bearer owner')
      .expect(404);
    await request(app.getHttpServer())
      .post(`${path}/query`)
      .set('Authorization', 'Bearer stranger')
      .send(profileQuery())
      .expect(403);
    await request(app.getHttpServer())
      .post(`${path}/query`)
      .set('Authorization', 'Bearer owner')
      .send(profileQuery())
      .expect(201)
      .expect(({ body }) =>
        expect(body).toEqual({ items: [], total: 0, page: 1, pageSize: 20 }),
      );
  });
  it('uses the shared SDK upload rate limit', async () => {
    let response;
    for (let index = 0; index < 101; index++) {
      response = await request(app.getHttpServer())
        .post(sdk)
        .send(profileEnvelope());
      if (response.status === 429) break;
    }
    expect(response?.status).toBe(429);
    expect(Number(response?.headers['retry-after'])).toBeGreaterThan(0);
  });
});

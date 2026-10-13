import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { MonitoringProjectsService } from './monitoring-projects.service';
import { MonitoringEventsService } from '../monitoring-events/monitoring-events.service';
import { SdkEnvelopeController } from '../monitoring-events/sdk-envelope.controller';
import { SdkCheckController } from './sdk-check.controller';
import { sdkCors } from '../common/http/sdk-cors';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';

const id = '550e8400-e29b-41d4-a716-446655440000';
const report = {
  version: 1,
  type: 'client_report',
  sentAt: '2026-10-01T00:00:00Z',
  sdk: { name: '@pms/sdk-vue', version: '0.1.0' },
};
const event = {
  version: 1,
  type: 'event',
  sentAt: '2026-10-01T00:00:00Z',
  event: {
    eventId: '550e8400-e29b-41d4-a716-446655440001',
    timestamp: '2026-10-01T00:00:00Z',
    type: 'error',
    level: 'error',
    source: 'vue',
    message: 'failed',
    exception: { type: 'Error', value: 'failed' },
  },
};
describe('SDK standard setup HTTP origins and credentials', () => {
  let app: NestExpressApplication;
  let allowedOrigins = ['*'];
  const repository = {
    findOne: jest.fn((options: { where: { publicKey?: string } }) =>
      Promise.resolve(
        options.where.publicKey && options.where.publicKey !== 'key'
          ? null
          : {
              id,
              publicKey: 'key',
              allowedOrigins,
              errorMonitoringEnabled: false,
            },
      ),
    ),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const database = {
    manager: { update: jest.fn().mockResolvedValue(undefined) },
  };
  beforeAll(async () => {
    const projects = new MonitoringProjectsService(
      repository as never,
      {} as never,
      new ConfigService(),
    );
    const module = await Test.createTestingModule({
      controllers: [SdkEnvelopeController, SdkCheckController],
      providers: [
        { provide: MonitoringProjectsService, useValue: projects },
        {
          provide: MonitoringEventsService,
          useValue: new MonitoringEventsService(database as never, projects),
        },
      ],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix('api');
    app.enableCors(sdkCors(['https://admin.test']));
    app.useGlobalInterceptors(new ResponseInterceptor(new Reflector()));
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    allowedOrigins = ['*'];
    database.manager.update.mockClear();
  });
  it('accepts a valid key with default wildcard and exposes cross-origin failures', async () => {
    const accepted = await request(app.getHttpServer())
      .post(`/api/sdk/${id}/envelope`)
      .set('Origin', 'https://new.test')
      .set('X-PMS-Key', 'key')
      .send(report)
      .expect(202);
    expect(accepted.headers['access-control-allow-origin']).toBe('*');
    const badKey = await request(app.getHttpServer())
      .post(`/api/sdk/${id}/envelope`)
      .set('Origin', 'https://new.test')
      .set('X-PMS-Key', 'wrong')
      .send(report)
      .expect(404);
    expect(badKey.headers['access-control-allow-origin']).toBe('*');
    const disabled = await request(app.getHttpServer())
      .post(`/api/sdk/${id}/envelope`)
      .set('Origin', 'https://new.test')
      .set('X-PMS-Key', 'key')
      .send(event)
      .expect(403);
    expect(disabled.headers['access-control-allow-origin']).toBe('*');
  });
  it('enforces exact origins and explicit deny-all while preserving no-Origin server compatibility', async () => {
    allowedOrigins = ['https://allowed.test'];
    const denied = await request(app.getHttpServer())
      .post(`/api/sdk/${id}/envelope`)
      .set('Origin', 'https://other.test')
      .set('X-PMS-Key', 'key')
      .send(report)
      .expect(403);
    expect(denied.headers['access-control-allow-origin']).toBe('*');
    expect(database.manager.update).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post(`/api/sdk/${id}/envelope`)
      .set('Origin', 'https://allowed.test')
      .set('X-PMS-Key', 'key')
      .send(report)
      .expect(202);
    allowedOrigins = [];
    await request(app.getHttpServer())
      .post(`/api/sdk/${id}/envelope`)
      .set('Origin', 'https://allowed.test')
      .set('X-PMS-Key', 'key')
      .send(report)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/sdk/${id}/envelope`)
      .set('X-PMS-Key', 'key')
      .send(report)
      .expect(202);
  });
  it('checks legacy diagnostics key and origin on every request', async () => {
    await request(app.getHttpServer())
      .post('/api/sdk/check')
      .set('Origin', 'https://new.test')
      .send({ projectId: id, publicKey: 'key' })
      .expect(200);
    const badKey = await request(app.getHttpServer())
      .post('/api/sdk/check')
      .set('Origin', 'https://new.test')
      .send({ projectId: id, publicKey: 'wrong' })
      .expect(404);
    expect(badKey.headers['access-control-allow-origin']).toBe('*');
    allowedOrigins = [];
    await request(app.getHttpServer())
      .post('/api/sdk/check')
      .set('Origin', 'https://new.test')
      .send({ projectId: id, publicKey: 'key' })
      .expect(403);
  });
  it('permits preflight independently of DB origins and keeps binding endpoint absent', async () => {
    allowedOrigins = [];
    const preflight = await request(app.getHttpServer())
      .options(`/api/sdk/${id}/envelope`)
      .set('Origin', 'https://new.test')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-pms-key')
      .expect(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('*');
    expect(preflight.headers['access-control-allow-headers']).toBe(
      'Content-Type,X-PMS-Key',
    );
    expect(
      preflight.headers['access-control-allow-credentials'],
    ).toBeUndefined();
    await request(app.getHttpServer())
      .post(`/api/sdk/${id}/bind`)
      .send({ code: 'A'.repeat(43) })
      .expect(404);
  });

  it('exposes malformed SDK errors cross-origin and keeps management and other methods closed', async () => {
    const invalid = await request(app.getHttpServer())
      .post(`/api/sdk/${id}/envelope`)
      .set('Origin', 'https://new.test')
      .send({})
      .expect(400);
    expect(invalid.headers['access-control-allow-origin']).toBe('*');
    for (const method of ['get', 'delete'] as const) {
      const result = await request(app.getHttpServer())
        [method](`/api/sdk/${id}/envelope`)
        .set('Origin', 'https://new.test');
      expect(result.headers['access-control-allow-origin']).toBeUndefined();
    }
    const management = await request(app.getHttpServer())
      .options('/api/groups')
      .set('Origin', 'https://new.test')
      .set('Access-Control-Request-Method', 'PATCH');
    expect(management.headers['access-control-allow-origin']).toBeUndefined();
  });
});

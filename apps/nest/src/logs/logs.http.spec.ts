import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { SdkEnvelopeController } from '../monitoring-events/sdk-envelope.controller';
import { MonitoringEventsService } from '../monitoring-events/monitoring-events.service';
import { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
import { LogsService } from './logs.service';
describe('Logs HTTP boundary', () => {
  let app: NestExpressApplication;
  const ingest = jest.fn(),
    origin = jest.fn();
  const path = '/sdk/550e8400-e29b-41d4-a716-446655440000/envelope';
  const envelope = () => ({
    version: 1,
    type: 'logs',
    sentAt: new Date().toISOString(),
    eventId: '550e8400-e29b-41d4-a716-446655440001',
    logs: [
      {
        logId: '550e8400-e29b-41d4-a716-446655440002',
        timestamp: new Date().toISOString(),
        level: 'warn',
        message: 'Warning',
        attributes: {},
      },
    ],
  });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SdkEnvelopeController],
      providers: [
        { provide: MonitoringEventsService, useValue: { ingest: jest.fn() } },
        { provide: LogsService, useValue: { ingest } },
        {
          provide: MonitoringProjectsService,
          useValue: { allowsSdkOrigin: origin },
        },
      ],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    ingest.mockReset().mockResolvedValue(undefined);
    origin.mockReset().mockResolvedValue(true);
  });
  it('routes structured logs and project key to ingestion', async () => {
    const payload = envelope();
    await request(app.getHttpServer())
      .post(path)
      .set('X-PMS-Key', 'key')
      .send(payload)
      .expect(202);
    expect(ingest).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      'key',
      payload,
    );
  });
  it('rejects malformed logs before ingestion', async () => {
    const input = envelope();
    input.logs[0].level = 'invalid';
    await request(app.getHttpServer()).post(path).send(input).expect(400);
    expect(ingest).not.toHaveBeenCalled();
  });
  it('rejects disallowed origins before ingestion', async () => {
    origin.mockResolvedValue(false);
    await request(app.getHttpServer())
      .post(path)
      .set('Origin', 'https://denied.test')
      .send(envelope())
      .expect(403);
    expect(ingest).not.toHaveBeenCalled();
  });
  it('preserves invalid-key and disabled-project responses', async () => {
    ingest.mockRejectedValueOnce(new NotFoundException());
    await request(app.getHttpServer()).post(path).send(envelope()).expect(404);
    ingest.mockRejectedValueOnce(new ForbiddenException());
    await request(app.getHttpServer()).post(path).send(envelope()).expect(403);
    expect(ingest).toHaveBeenCalledTimes(2);
  });
});

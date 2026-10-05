import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { SdkEnvelopeController } from '../monitoring-events/sdk-envelope.controller';
import { MonitoringEventsService } from '../monitoring-events/monitoring-events.service';
import { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
import { MetricsService } from './metrics.service';
describe('Metrics HTTP ingestion boundary', () => {
  let app: NestExpressApplication;
  const ingest = jest.fn();
  const origin = jest.fn();
  const path = '/sdk/550e8400-e29b-41d4-a716-446655440000/envelope';
  const envelope = () => ({
    version: 1,
    type: 'metrics',
    sentAt: new Date().toISOString(),
    eventId: '550e8400-e29b-41d4-a716-446655440001',
    samples: [
      {
        name: 'orders',
        type: 'count',
        unit: 'none',
        value: 1,
        timestamp: new Date().toISOString(),
        attributes: {},
      },
    ],
  });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SdkEnvelopeController],
      providers: [
        { provide: MonitoringEventsService, useValue: { ingest: jest.fn() } },
        { provide: MetricsService, useValue: { ingest } },
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
  it('routes metrics envelope and project key to the metrics service', async () => {
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
  it('rejects invalid samples before calling ingestion', async () => {
    const payload = envelope();
    payload.samples[0].value = -1;
    await request(app.getHttpServer()).post(path).send(payload).expect(400);
    expect(ingest).not.toHaveBeenCalled();
  });
  it('enforces Origin before calling ingestion', async () => {
    origin.mockResolvedValue(false);
    await request(app.getHttpServer())
      .post(path)
      .set('Origin', 'https://denied.test')
      .send(envelope())
      .expect(403);
    expect(ingest).not.toHaveBeenCalled();
  });
  it('preserves missing-key and metrics-disabled responses', async () => {
    ingest.mockRejectedValueOnce(new NotFoundException());
    await request(app.getHttpServer()).post(path).send(envelope()).expect(404);
    ingest.mockRejectedValueOnce(new ForbiddenException());
    await request(app.getHttpServer())
      .post(path)
      .set('X-PMS-Key', 'key')
      .send(envelope())
      .expect(403);
    expect(ingest).toHaveBeenCalledTimes(2);
  });
});

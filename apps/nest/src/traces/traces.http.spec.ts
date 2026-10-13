import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { MonitoringEventsService } from '../monitoring-events/monitoring-events.service';
import { SdkEnvelopeController } from '../monitoring-events/sdk-envelope.controller';
import { TracesService } from './traces.service';
import { transactionFixture } from './traces-test.fixture';

describe('transaction HTTP dispatch boundary', () => {
  let app: NestExpressApplication;
  const ingest = jest.fn(() => Promise.resolve());
  const legacy = jest.fn(() => Promise.resolve());
  const path = '/sdk/550e8400-e29b-41d4-a716-446655440000/envelope';
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SdkEnvelopeController],
      providers: [
        { provide: MonitoringEventsService, useValue: { ingest: legacy } },
        { provide: TracesService, useValue: { ingest } },
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
  beforeEach(() => {
    ingest.mockClear();
    legacy.mockClear();
  });
  afterAll(async () => {
    await app.close();
  });
  it('dispatches validated transaction exclusively to tracing service and returns 202', async () => {
    const input = transactionFixture();
    await request(app.getHttpServer())
      .post(path)
      .set('X-PMS-Key', 'public-key')
      .send(input)
      .expect(202);
    expect(ingest).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      'public-key',
      input,
    );
    expect(legacy).not.toHaveBeenCalled();
  });
  it('rejects raw coerced scalars and duplicate IDs before service invocation', async () => {
    const input = transactionFixture();
    Object.assign(input.transaction.spans[0], { durationMs: '20' });
    await request(app.getHttpServer()).post(path).send(input).expect(400);
    expect(ingest).not.toHaveBeenCalled();
  });
});

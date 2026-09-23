import { Body, Controller, Post, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { configureBodyParsers } from '../common/http/configure-body-parsers';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { IngestEnvelopeDto } from './dto/ingest-envelope.dto';
import { MonitoringEventsService } from './monitoring-events.service';
import { SdkEnvelopeController } from './sdk-envelope.controller';

@Controller('ordinary')
class OrdinaryController {
  @Post()
  echo(@Body() body: { data: string }) {
    return { length: body.data.length };
  }
}

const eventEnvelope = () => ({
  version: 1,
  type: 'event',
  sentAt: '2026-09-23T03:00:00Z',
  event: {
    eventId: '550e8400-e29b-41d4-a716-446655440001',
    timestamp: '2026-09-23T03:00:00Z',
    type: 'error',
    level: 'error',
    source: 'vue',
    message: 'Render failed',
    exception: { type: 'Error', value: 'Render failed' },
  },
});

describe.each(['api', 'custom/v2'])(
  'SDK HTTP boundary with API_PREFIX=%s',
  (prefix) => {
    let app: NestExpressApplication;
    const accepted: IngestEnvelopeDto[] = [];
    const sdkPath = `/${prefix}/sdk/550e8400-e29b-41d4-a716-446655440000/envelope`;

    beforeAll(async () => {
      const module = await Test.createTestingModule({
        controllers: [SdkEnvelopeController, OrdinaryController],
        providers: [
          {
            provide: MonitoringEventsService,
            useValue: {
              ingest: (
                _projectId: string,
                _key: string,
                envelope: IngestEnvelopeDto,
              ) => {
                accepted.push(envelope);
                return Promise.resolve();
              },
            },
          },
        ],
      }).compile();
      app = module.createNestApplication<NestExpressApplication>({
        bodyParser: false,
      });
      configureBodyParsers(app, prefix);
      app.setGlobalPrefix(prefix);
      app.useGlobalPipes(
        new ValidationPipe({
          forbidNonWhitelisted: true,
          transform: true,
          transformOptions: { enableImplicitConversion: true },
          whitelist: true,
        }),
      );
      app.useGlobalFilters(
        new AllExceptionsFilter(app.get(HttpAdapterHost), {
          error: () => undefined,
          warn: () => undefined,
        } as never),
      );
      await app.init();
    });
    afterAll(async () => {
      await app.close();
    });
    beforeEach(() => {
      accepted.length = 0;
    });

    it('rejects raw object scalars with 400 before the global implicit conversion', async () => {
      const input = eventEnvelope();
      await request(app.getHttpServer())
        .post(sdkPath)
        .send({
          ...input,
          event: { ...input.event, message: { toString: null } },
        })
        .expect(400);
      expect(accepted).toEqual([]);
    });

    it('rejects special unknown root keys with 400 before they can disappear', async () => {
      const input = {
        ...eventEnvelope(),
        ...Object.fromEntries([['__proto__', 'unexpected']]),
      };
      await request(app.getHttpServer())
        .post(sdkPath)
        .send(JSON.stringify(input))
        .set('Content-Type', 'application/json')
        .expect(400);
      expect(accepted).toEqual([]);
    });

    it('preserves a valid toString tag across the complete HTTP pipeline', async () => {
      const input = eventEnvelope();
      await request(app.getHttpServer())
        .post(sdkPath)
        .set('X-PMS-Key', 'key')
        .send({
          ...input,
          event: { ...input.event, tags: { toString: 'label' } },
        })
        .expect(202);
      expect(accepted[0].event!.tags).toEqual({ toString: 'label' });
    });

    // Review R4: this valid decoded 64 KiB stack becomes over 100 KiB on the wire.
    it('delivers a valid 64 KiB escaped stack to the Controller', async () => {
      const input = eventEnvelope();
      const stacktrace = '\\'.repeat(65536);
      const body = JSON.stringify({
        ...input,
        event: {
          ...input.event,
          exception: { ...input.event.exception, stacktrace },
        },
      });
      expect(Buffer.byteLength(body)).toBeGreaterThan(100 * 1024);
      await request(app.getHttpServer())
        .post(sdkPath)
        .set('Content-Type', 'application/json')
        .set('X-PMS-Key', 'key')
        .send(body)
        .expect(202);
      expect(accepted[0].event!.exception.stacktrace).toBe(stacktrace);
    });

    it('returns 413 above the SDK 512 KiB limit without calling the Controller', async () => {
      await request(app.getHttpServer())
        .post(sdkPath)
        .send({ data: 'x'.repeat(512 * 1024) })
        .expect(413);
      expect(accepted).toEqual([]);
    });

    it('parses exactly 512 KiB on the SDK route before applying DTO validation', async () => {
      const body = JSON.stringify({ data: 'x'.repeat(512 * 1024 - 11) });
      expect(Buffer.byteLength(body)).toBe(512 * 1024);
      await request(app.getHttpServer())
        .post(sdkPath)
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(400);
      expect(accepted).toEqual([]);
    });

    it('keeps ordinary JSON APIs below 100 KiB working', async () => {
      const response = await request(app.getHttpServer())
        .post(`/${prefix}/ordinary`)
        .send({ data: 'x'.repeat(99 * 1024) });
      expect(response.status).toBe(201);
      expect(response.body).toEqual({ length: 99 * 1024 });
    });

    it('keeps the ordinary JSON API limit at 100 KiB and preserves HTTP 413', async () => {
      const response = await request(app.getHttpServer())
        .post(`/${prefix}/ordinary`)
        .send({ data: 'x'.repeat(100 * 1024) });
      expect(response.status).toBe(413);
      expect(response.body).toMatchObject({
        statusCode: 413,
        message: 'Payload too large',
      });
    });

    it('accepts exactly 100 KiB on an ordinary JSON API', async () => {
      const body = JSON.stringify({ data: 'x'.repeat(100 * 1024 - 11) });
      expect(Buffer.byteLength(body)).toBe(100 * 1024);
      await request(app.getHttpServer())
        .post(`/${prefix}/ordinary`)
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(201)
        .expect({ length: 100 * 1024 - 11 });
    });
  },
);

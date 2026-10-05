import { Controller, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { SdkRateLimitGuard } from './sdk-rate-limit.guard';
import { SdkRateLimitService } from './sdk-rate-limit.service';
import { sdkCors } from './sdk-cors';

@Controller()
class LimitFixture {
  @Post('sdk/:projectId/envelope') envelope() {
    return { ok: true };
  }
  @Post('sdk/check') check() {
    return { ok: true };
  }
  @Post('groups') management() {
    return { ok: true };
  }
}

describe('SDK IP limit HTTP', () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [LimitFixture],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix('api');
    app.enableCors(sdkCors(['https://admin.test']));
    const config = new ConfigService({
      monitoring: { sdkRateLimitPerMinute: 1 },
    });
    app.useGlobalGuards(
      new SdkRateLimitGuard(new SdkRateLimitService(config), config),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  it('returns HTTP 429 and Retry-After while management requests keep working', async () => {
    await request(app.getHttpServer()).post('/api/sdk/check').expect(201);
    const result = await request(app.getHttpServer())
      .post('/api/sdk/check')
      .set('Origin', 'https://new.test')
      .set('X-Forwarded-For', 'different-untrusted-ip')
      .expect(429);
    expect(Number(result.headers['retry-after'])).toBeGreaterThan(0);
    expect(result.headers['access-control-allow-origin']).toBe('*');
    expect(result.body.message).toBe('SDK rate limit exceeded');
    for (const path of [
      '/api/SDK/check',
      '/API/sdk/check',
      '/API/SDK/CHECK',
      '/api/sdk/check/',
      '/api/sdk/550e8400-e29b-41d4-a716-446655440000/envelope',
      '/api/sdk/%3550e8400-e29b-41d4-a716-446655440000/envelope',
    ]) {
      await request(app.getHttpServer()).post(path).expect(429);
    }
    await request(app.getHttpServer()).post('/api/groups').expect(201);
  });
});

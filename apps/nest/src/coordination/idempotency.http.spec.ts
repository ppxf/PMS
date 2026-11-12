import { Body, Controller, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { CoordinationService } from './coordination.service';
import { IdempotencyInterceptor } from './idempotency.interceptor';

let writes = 0;
@Controller('groups')
class GroupsController {
  @Post() create(@Body() body: { name: string }) {
    writes++;
    return { id: writes, name: body.name, permissions: [] };
  }
}
describe('HTTP idempotency response contract', () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [GroupsController],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    app.use(
      (req: { user?: { id: string } }, _res: unknown, next: () => void) => {
        req.user = { id: 'user' };
        next();
      },
    );
    app.useGlobalInterceptors(
      new IdempotencyInterceptor(
        new CoordinationService(new ConfigService()),
        {} as never,
        {} as never,
        {} as never,
      ),
      new ResponseInterceptor(new Reflector()),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  it('replays the same HTTP status and response envelope without executing the write twice', async () => {
    const first = await request(app.getHttpServer())
      .post('/groups')
      .set('Idempotency-Key', 'write-request-1')
      .send({ name: 'team' })
      .expect(201);
    const replay = await request(app.getHttpServer())
      .post('/groups')
      .set('Idempotency-Key', 'write-request-1')
      .send({ name: 'team' })
      .expect(201);
    expect(replay.body).toEqual(first.body);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(writes).toBe(1);
    await request(app.getHttpServer())
      .post('/groups')
      .set('Idempotency-Key', 'write-request-1')
      .send({ name: 'changed' })
      .expect(409);
    expect(writes).toBe(1);
  });
});

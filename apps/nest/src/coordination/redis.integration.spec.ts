import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { CoordinationService } from './coordination.service';
import { RedisService } from './redis.service';

const redisUrl = process.env.REDIS_TEST_URL;
const integration = redisUrl ? describe : describe.skip;
integration('real Redis cross-instance coordination', () => {
  const prefix = `pms-test:${randomUUID()}:`;
  let redisA: RedisService;
  let redisB: RedisService;
  let a: CoordinationService;
  let b: CoordinationService;
  const cleanup = createClient({
    url: redisUrl,
    socket: { reconnectStrategy: false, connectTimeout: 3000 },
  });
  cleanup.on('error', () => undefined);
  beforeAll(async () => {
    const config = new ConfigService({
      redis: { url: redisUrl, keyPrefix: prefix },
    });
    redisA = new RedisService(config);
    redisB = new RedisService(config);
    redisA.onModuleInit();
    redisB.onModuleInit();
    await cleanup.connect();
    // Initialization intentionally allows API reads during Redis recovery.
    for (let i = 0; i < 100; i++) {
      try {
        await Promise.all([
          redisA.eval('return 1', 'ready', []),
          redisB.eval('return 1', 'ready', []),
        ]);
        break;
      } catch {
        if (i === 99) throw new Error('Test Redis unavailable');
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    a = new CoordinationService(config, redisA);
    b = new CoordinationService(config, redisB);
  }, 15000);
  afterAll(async () => {
    redisA?.onModuleDestroy();
    redisB?.onModuleDestroy();
    if (cleanup.isReady) {
      const keys = await cleanup.keys(`${prefix}*`);
      if (keys.length) await cleanup.del(keys);
    }
    if (cleanup.isOpen) cleanup.destroy();
  });
  it('atomically admits only the shared quota across two instances', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        (index % 2 ? a : b).consume('shared', 5, 60000),
      ),
    );
    expect(results.filter((retry) => retry === 0)).toHaveLength(5);
    expect(results.filter((retry) => retry > 0)).toHaveLength(15);
  });
  it('coordinates concurrent writes, token ownership, replay and conflicting content', async () => {
    const results = await Promise.all([
      a.begin('write', 'body'),
      b.begin('write', 'body'),
    ]);
    expect(results.map((r) => r.state).sort()).toEqual(['acquired', 'pending']);
    const owner = results.find((r) => r.state === 'acquired');
    if (owner?.state !== 'acquired') throw new Error('No owner');
    expect(await b.renew('write', owner.token)).toBe(true);
    await b.release('write', 'stale-token');
    expect((await a.begin('write', 'body')).state).toBe('pending');
    await a.complete('write', owner.token, {
      status: 201,
      body: { id: 'saved' },
    });
    expect(await b.begin('write', 'body')).toMatchObject({
      state: 'done',
      response: { status: 201, body: { id: 'saved' } },
    });
    expect(await b.begin('write', 'different')).toEqual({ state: 'conflict' });
  });
  it('does not fall back to memory when a configured connection closes', async () => {
    redisB.onModuleDestroy();
    await expect(b.consume('closed', 1, 1000)).rejects.toThrow(
      'Request coordination unavailable',
    );
  });
  it('preserves empty arrays and nested response shapes during Redis replay', async () => {
    const acquired = await a.begin('arrays', 'hash');
    if (acquired.state !== 'acquired') throw new Error('No lease');
    const response = {
      status: 200,
      body: {
        permissions: [],
        nested: [{ items: [] }],
        number: 1.23456789012345,
      },
    };
    await a.complete('arrays', acquired.token, response);
    expect(await a.begin('arrays', 'hash')).toEqual({
      state: 'done',
      response,
    });
  });
});

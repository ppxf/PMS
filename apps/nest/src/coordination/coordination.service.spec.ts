import { ConfigService } from '@nestjs/config';
import { CoordinationService } from './coordination.service';

describe('request coordination', () => {
  const subject = () => new CoordinationService(new ConfigService(), undefined);
  it('shares a quota and resets only after its window', async () => {
    const store = subject();
    expect(await store.consume('ip', 1, 60_000)).toBe(0);
    expect(await store.consume('ip', 1, 60_000)).toBeGreaterThan(0);
    expect(await store.consume('other', 1, 60_000)).toBe(0);
  });
  it('replays a completed request and rejects different payloads and concurrent requests', async () => {
    const store = subject();
    const first = await store.begin('request', 'hash');
    expect(first.state).toBe('acquired');
    expect((await store.begin('request', 'hash')).state).toBe('pending');
    expect((await store.begin('request', 'different')).state).toBe('conflict');
    if (first.state !== 'acquired') throw new Error('not acquired');
    await store.complete('request', first.token, {
      status: 201,
      body: { id: 'created' },
    });
    expect(await store.begin('request', 'hash')).toMatchObject({
      state: 'done',
      response: { status: 201, body: { id: 'created' } },
    });
  });
  it('only the current lease holder can release or complete a request', async () => {
    const store = subject();
    const first = await store.begin('request', 'hash');
    await store.release('request', 'wrong');
    expect((await store.begin('request', 'hash')).state).toBe('pending');
    await expect(
      store.complete('request', 'wrong', { status: 200, body: {} }),
    ).rejects.toThrow();
    if (first.state !== 'acquired') throw new Error('not acquired');
    await store.release('request', first.token);
    expect((await store.begin('request', 'hash')).state).toBe('acquired');
  });
  it('fails closed when a configured Redis backend is unavailable', async () => {
    const redis = {
      enabled: true,
      eval: jest.fn().mockRejectedValue(new Error('offline')),
    };
    const store = new CoordinationService(new ConfigService(), redis as never);
    await expect(store.consume('ip', 1, 60000)).rejects.toThrow(
      'Request coordination unavailable',
    );
    await expect(store.begin('id', 'body')).rejects.toThrow(
      'Request coordination unavailable',
    );
  });
});

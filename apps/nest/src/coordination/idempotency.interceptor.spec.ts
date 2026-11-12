import { ConfigService } from '@nestjs/config';
import { firstValueFrom, of, Subject, throwError } from 'rxjs';
import { CoordinationService } from './coordination.service';
import { IdempotencyInterceptor } from './idempotency.interceptor';

describe('authenticated management idempotency', () => {
  const make = () => {
    const access = { requireOwner: jest.fn().mockResolvedValue({}) };
    const interceptor = new IdempotencyInterceptor(
      new CoordinationService(new ConfigService()),
      access as never,
      {} as never,
      {} as never,
    );
    const response = { statusCode: 201, setHeader: jest.fn() };
    const req = {
      method: 'POST',
      originalUrl: '/api/groups',
      headers: { 'idempotency-key': 'request-key-123' },
      user: { id: 'u1' },
      body: { name: 'team' },
      params: {},
    };
    const context = {
      getType: () => 'http',
      getClass: () => ({ name: 'GroupsController' }),
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => response,
      }),
    };
    return { interceptor, access, req, context, response };
  };
  it('runs a write once and replays only within the same user and payload', async () => {
    const { interceptor, req, context, response } = make();
    const next = { handle: jest.fn(() => of({ id: 'group-id' })) };
    expect(
      await firstValueFrom(await interceptor.intercept(context as never, next)),
    ).toEqual({ id: 'group-id' });
    expect(
      await firstValueFrom(await interceptor.intercept(context as never, next)),
    ).toEqual({ id: 'group-id' });
    expect(next.handle).toHaveBeenCalledTimes(1);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Idempotency-Replayed',
      'true',
    );
    req.body.name = 'other';
    await expect(interceptor.intercept(context as never, next)).rejects.toThrow(
      'different request',
    );
    req.user.id = 'u2';
    await firstValueFrom(await interceptor.intercept(context as never, next));
    expect(next.handle).toHaveBeenCalledTimes(2);
  });
  it('rechecks project ownership before replaying a successful write', async () => {
    const { interceptor, req, context, access } = make();
    Object.assign(req.params, { groupSlug: 'team', projectSlug: 'web' });
    const next = { handle: () => of({ ok: true }) };
    await firstValueFrom(await interceptor.intercept(context as never, next));
    access.requireOwner.mockRejectedValueOnce(
      new Error('Project owner required'),
    );
    await expect(interceptor.intercept(context as never, next)).rejects.toThrow(
      'Project owner required',
    );
  });
  it('releases failed requests so corrected transient failures can retry', async () => {
    const { interceptor, context } = make();
    await expect(
      firstValueFrom(
        await interceptor.intercept(context as never, {
          handle: () => throwError(() => new Error('failed')),
        }),
      ),
    ).rejects.toThrow('failed');
    expect(
      await firstValueFrom(
        await interceptor.intercept(context as never, {
          handle: () => of('ok'),
        }),
      ),
    ).toBe('ok');
  });
  it('renews a long-running request and never releases a write after completion storage fails', async () => {
    jest.useFakeTimers();
    try {
      const store = {
        begin: jest
          .fn()
          .mockResolvedValue({ state: 'acquired', token: 'lease' }),
        renew: jest.fn().mockResolvedValue(true),
        complete: jest.fn().mockRejectedValue(new Error('Redis OOM')),
        release: jest.fn(),
      };
      const { context } = make();
      const interceptor = new IdempotencyInterceptor(
        store as never,
        {} as never,
        {} as never,
        {} as never,
      );
      const result = new Subject<unknown>();
      const pending = firstValueFrom(
        await interceptor.intercept(context as never, { handle: () => result }),
      );
      await jest.advanceTimersByTimeAsync(75000);
      expect(store.renew).toHaveBeenCalledTimes(5);
      const failure = pending.catch((error: unknown) => error);
      result.next({ id: 'committed' });
      result.complete();
      expect(await failure).toEqual(new Error('Redis OOM'));
      expect(store.release).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
  it('does not cache authentication results even with an idempotency key', async () => {
    const { interceptor, context } = make();
    const authContext = {
      ...context,
      getClass: () => ({ name: 'AuthController' }),
    };
    const next = { handle: jest.fn(() => of({ accessToken: 'secret' })) };
    await firstValueFrom(
      await interceptor.intercept(authContext as never, next),
    );
    await firstValueFrom(
      await interceptor.intercept(authContext as never, next),
    );
    expect(next.handle).toHaveBeenCalledTimes(2);
  });
  it('rejects malformed workspace identifiers before any database access', async () => {
    const { req, context } = make();
    Object.assign(req, {
      path: '/api/workspace/alerts/bad/acknowledge',
      params: { id: '-'.repeat(36) },
    });
    const query = jest.fn();
    const interceptor = new IdempotencyInterceptor(
      new CoordinationService(new ConfigService()),
      {} as never,
      {} as never,
      { query } as never,
    );
    await expect(
      interceptor.intercept(
        {
          ...context,
          getClass: () => ({ name: 'WorkspaceController' }),
        } as never,
        { handle: () => of('ok') },
      ),
    ).rejects.toThrow('Invalid resource ID');
    expect(query).not.toHaveBeenCalled();
  });
});

import {
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { RedisService } from './redis.service';

export const RATE_SCRIPT = `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[2]) end; if n>tonumber(ARGV[1]) then return math.max(1,redis.call('PTTL',KEYS[1])) end; return 0`;
export const BEGIN_SCRIPT = `local v=redis.call('GET',KEYS[1]); if v then return v end; redis.call('SET',KEYS[1],ARGV[1],'PX',ARGV[2]); return ''`;
export const CHANGE_SCRIPT = `local v=redis.call('GET',KEYS[1]); if not v then return 0 end; local d=cjson.decode(v); if d.token~=ARGV[1] or d.state~='pending' then return 0 end; if ARGV[2]=='release' then return redis.call('DEL',KEYS[1]) end; if ARGV[2]=='renew' then return redis.call('PEXPIRE',KEYS[1],ARGV[4]) end; redis.call('SET',KEYS[1],ARGV[3],'PX',ARGV[4]); return 1`;
export const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export interface StoredResponse {
  status: number;
  body: unknown;
}
interface Entry {
  state: 'pending' | 'done';
  hash: string;
  token: string;
  response?: StoredResponse | string;
}
export type Acquisition =
  | { state: 'acquired'; token: string }
  | { state: 'conflict' }
  | { state: 'pending' }
  | { state: 'done'; response: StoredResponse };
const LEASE_MS = 60_000;

@Injectable()
export class CoordinationService {
  private readonly memory = new Map<
    string,
    { value: string; expires: number }
  >();
  private readonly maxEntries: number;
  constructor(
    config: ConfigService,
    @Optional() private readonly redis?: RedisService,
  ) {
    this.maxEntries = config.get<number>('redis.memoryMaxEntries', 10000);
    if (!redis?.enabled && config.get('app.environment') === 'production') {
      throw new Error('Redis is required in production');
    }
  }
  private available(key: string) {
    const now = Date.now();
    // Bounded fallback only for local development and isolated unit tests.
    if (this.memory.size >= this.maxEntries) {
      for (const [k, v] of this.memory)
        if (v.expires <= now) this.memory.delete(k);
    }
    if (!this.memory.has(key) && this.memory.size >= this.maxEntries)
      throw new ServiceUnavailableException(
        'Request coordination capacity reached',
      );
    const entry = this.memory.get(key);
    if (entry && entry.expires <= now) {
      this.memory.delete(key);
      return undefined;
    }
    return entry;
  }
  private async evaluate(script: string, key: string, args: string[]) {
    try {
      return await this.redis!.eval(script, key, args);
    } catch {
      throw new ServiceUnavailableException('Request coordination unavailable');
    }
  }
  async consume(
    scope: string,
    limit: number,
    windowMs: number,
  ): Promise<number> {
    const key = `rate:${digest(scope)}`;
    if (this.redis?.enabled)
      return Number(
        await this.evaluate(RATE_SCRIPT, key, [
          String(limit),
          String(windowMs),
        ]),
      );
    const existing = this.available(key);
    const count = Number(existing?.value ?? 0) + 1;
    const expires = existing?.expires ?? Date.now() + windowMs;
    this.memory.set(key, { value: String(count), expires });
    return count > limit ? Math.max(1, expires - Date.now()) : 0;
  }
  async begin(scope: string, hash: string): Promise<Acquisition> {
    const key = `idempotency:${digest(scope)}`;
    const token = randomUUID();
    const value = JSON.stringify({
      state: 'pending',
      token,
      hash,
    } satisfies Entry);
    let previous: string | undefined;
    if (this.redis?.enabled)
      previous =
        String(
          await this.evaluate(BEGIN_SCRIPT, key, [value, String(LEASE_MS)]),
        ) || undefined;
    else {
      previous = this.available(key)?.value;
      if (!previous)
        this.memory.set(key, { value, expires: Date.now() + LEASE_MS });
    }
    if (!previous) return { state: 'acquired', token };
    const entry = JSON.parse(previous) as Entry;
    if (entry.hash !== hash) return { state: 'conflict' };
    return entry.state === 'done'
      ? {
          state: 'done',
          response:
            typeof entry.response === 'string'
              ? (JSON.parse(entry.response) as StoredResponse)
              : entry.response!,
        }
      : { state: 'pending' };
  }
  private async change(
    scope: string,
    token: string,
    operation: 'renew' | 'release' | 'complete',
    response?: StoredResponse,
  ) {
    const key = `idempotency:${digest(scope)}`;
    // Completion obtains the original payload digest without accepting caller-controlled state.
    const value = response ? JSON.stringify(response) : '';
    if (this.redis?.enabled) {
      const script =
        operation === 'complete'
          ? `local v=redis.call('GET',KEYS[1]); if not v then return 0 end; local d=cjson.decode(v); if d.token~=ARGV[1] or d.state~='pending' then return 0 end; d.state='done'; d.response=ARGV[3]; redis.call('SET',KEYS[1],cjson.encode(d),'PX',ARGV[4]); return 1`
          : CHANGE_SCRIPT;
      return (
        Number(
          await this.evaluate(script, key, [
            token,
            operation,
            value,
            String(operation === 'complete' ? 86400000 : LEASE_MS),
          ]),
        ) === 1
      );
    }
    const record = this.available(key);
    if (!record) return false;
    const entry = JSON.parse(record.value) as Entry;
    if (entry.token !== token || entry.state !== 'pending') return false;
    if (operation === 'release') this.memory.delete(key);
    else
      this.memory.set(key, {
        value:
          operation === 'complete'
            ? JSON.stringify({ ...entry, state: 'done', response })
            : record.value,
        expires: Date.now() + (operation === 'complete' ? 86400000 : LEASE_MS),
      });
    return true;
  }
  async complete(scope: string, token: string, response: StoredResponse) {
    if (!(await this.change(scope, token, 'complete', response)))
      throw new ServiceUnavailableException('Idempotency lease lost');
  }
  renew(scope: string, token: string) {
    return this.change(scope, token, 'renew');
  }
  release(scope: string, token: string) {
    return this.change(scope, token, 'release');
  }
}

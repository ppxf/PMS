import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client;
  readonly enabled: boolean;
  readonly prefix: string;
  constructor(config: ConfigService) {
    const url = config.get<string>('redis.url', '');
    this.enabled = Boolean(url);
    this.prefix = config.get<string>('redis.keyPrefix', 'pms:');
    this.client = url
      ? createClient({
          url,
          disableOfflineQueue: true,
          socket: {
            connectTimeout: 3000,
            reconnectStrategy: (retries) => Math.min(100 * (retries + 1), 3000),
          },
        })
      : undefined;
    // Never log transport errors: a URL can contain authentication credentials.
    this.client?.on('error', () =>
      this.logger.warn('Redis connection unavailable'),
    );
  }
  onModuleInit() {
    if (!this.client) return;
    // The API can serve reads during Redis recovery, but coordination fails closed.
    void this.client
      .connect()
      .catch(() => this.logger.warn('Redis initial connection failed'));
  }
  onModuleDestroy() {
    if (this.client?.isOpen) this.client.destroy();
  }
  async eval(script: string, key: string, args: string[]): Promise<unknown> {
    if (!this.client?.isReady)
      throw new ServiceUnavailableException('Request coordination unavailable');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.client.eval(script, {
          keys: [this.prefix + key],
          arguments: args,
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new ServiceUnavailableException(
                  'Request coordination unavailable',
                ),
              ),
            3000,
          );
        }),
      ]);
    } catch {
      throw new ServiceUnavailableException('Request coordination unavailable');
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

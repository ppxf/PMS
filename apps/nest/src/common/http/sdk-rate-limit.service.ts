import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface Window {
  count: number;
  expiresAt: number;
}

@Injectable()
export class SdkRateLimitService {
  private readonly windows = new Map<string, Window>();
  private readonly limit: number;
  private readonly maxEntries: number;
  private readonly windowMs = 60000;
  private nextSweepAt = 0;
  constructor(config: ConfigService) {
    const positive = (value: number, fallback: number) =>
      Number.isSafeInteger(value) && value > 0 ? value : fallback;
    this.limit = positive(
      config.get<number>('monitoring.sdkRateLimitPerMinute', 120),
      120,
    );
    this.maxEntries = positive(
      config.get<number>('monitoring.sdkRateLimitMaxIps', 10000),
      10000,
    );
  }
  consume(ip: string, setRetryAfter: (seconds: number) => void): void {
    const now = Date.now();
    if (now >= this.nextSweepAt || this.windows.size >= this.maxEntries) {
      for (const [key, value] of this.windows)
        if (value.expiresAt <= now) this.windows.delete(key);
      this.nextSweepAt = now + this.windowMs;
    }
    const key = ip || 'unknown';
    let window = this.windows.get(key);
    if (!window || window.expiresAt <= now) {
      if (!window && this.windows.size >= this.maxEntries) {
        this.reject(60, setRetryAfter);
      }
      window = { count: 0, expiresAt: now + this.windowMs };
      this.windows.set(key, window);
    }
    if (window.count >= this.limit)
      this.reject(
        Math.max(1, Math.ceil((window.expiresAt - now) / 1000)),
        setRetryAfter,
      );
    window.count++;
  }
  private reject(
    seconds: number,
    setRetryAfter: (seconds: number) => void,
  ): never {
    setRetryAfter(seconds);
    throw new HttpException('SDK rate limit exceeded', 429);
  }
}

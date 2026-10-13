import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { SdkRateLimitService } from './sdk-rate-limit.service';
import { isSdkUploadPath } from './sdk-cors';

@Injectable()
export class SdkRateLimitGuard implements CanActivate {
  constructor(
    private readonly limiter: SdkRateLimitService,
    private readonly config: ConfigService,
  ) {}
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<Request>();
    const sdk = isSdkUploadPath(
      request.path,
      this.config.get<string>('app.apiPrefix', 'api'),
    );
    if (request.method !== 'POST' || !sdk) return true;
    const response = context.switchToHttp().getResponse<Response>();
    // Express defaults to remoteAddress; do not trust arbitrary X-Forwarded-For.
    this.limiter.consume(
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
      (seconds) => response.setHeader('Retry-After', String(seconds)),
    );
    return true;
  }
}

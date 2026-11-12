import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { CoordinationService, digest } from './coordination.service';
import type { Request, Response } from 'express';
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(private readonly coordination: CoordinationService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      context.getType() !== 'http' ||
      context.getClass().name !== 'AuthController'
    )
      return true;
    const request = context.switchToHttp().getRequest<Request>();
    if (request.method !== 'POST') return true;
    const action = context.getHandler().name;
    const email =
      typeof request.body?.email === 'string'
        ? request.body.email.trim().toLowerCase().slice(0, 320)
        : '';
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const mailAction = [
      'register',
      'resendVerification',
      'forgotPassword',
    ].includes(action);
    const ipLimit = mailAction ? 10 : 30;
    const windowMs = mailAction ? 3600000 : 60000;
    const waits = [
      await this.coordination.consume(
        `auth:ip:${action}:${ip}`,
        ipLimit,
        windowMs,
      ),
    ];
    if (email)
      waits.push(
        await this.coordination.consume(
          `auth:account:${action}:${digest(email)}`,
          mailAction ? 3 : 10,
          mailAction ? 3600000 : 900000,
        ),
      );
    const wait = Math.max(...waits);
    if (wait > 0) {
      context
        .switchToHttp()
        .getResponse<Response>()
        .setHeader('Retry-After', Math.ceil(wait / 1000));
      throw new HttpException('Authentication rate limit exceeded', 429);
    }
    return true;
  }
}

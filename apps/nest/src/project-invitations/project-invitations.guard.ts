import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SdkRateLimitService } from '../common/http/sdk-rate-limit.service';

@Injectable()
export class ProjectInvitationRateLimitGuard implements CanActivate {
  constructor(private readonly limiter: SdkRateLimitService) {}
  canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { id: string } }>();
    const response = context.switchToHttp().getResponse<Response>();
    this.limiter.consume(
      `project-invitations:${request.user?.id ?? request.ip ?? request.socket.remoteAddress ?? 'unknown'}`,
      (seconds) => response.setHeader('Retry-After', String(seconds)),
    );
    return true;
  }
}

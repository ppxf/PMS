import { Readable } from 'node:stream';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { SSE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { map, Observable } from 'rxjs';
import { SKIP_RESPONSE_WRAP_KEY } from '../decorators/skip-response-wrap.decorator';
import { ApiSuccessResponse } from '../interfaces/api-response.interface';

interface HttpResponseLike {
  headersSent?: boolean;
  statusCode?: number;
  getHeader?(name: string): number | string | string[] | undefined;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  T | ApiSuccessResponse<T>
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<T | ApiSuccessResponse<T>> {
    if (this.shouldSkipBeforeHandling(context)) {
      return next.handle();
    }

    const response = context.switchToHttp().getResponse<HttpResponseLike>();

    return next.handle().pipe(
      map((data) => {
        if (this.isSpecialResponse(data, response)) {
          return data;
        }

        return {
          success: true as const,
          data,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }

  private shouldSkipBeforeHandling(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_RESPONSE_WRAP_KEY,
      [context.getHandler(), context.getClass()],
    );
    const isSse = this.reflector.get<boolean>(
      SSE_METADATA,
      context.getHandler(),
    );

    return Boolean(skip || isSse || context.getType() !== 'http');
  }

  private isSpecialResponse(data: T, response: HttpResponseLike): boolean {
    if (data instanceof StreamableFile || data instanceof Readable) {
      return true;
    }

    if (response.headersSent || response.statusCode === 204) {
      return true;
    }

    const contentType = String(response.getHeader?.('content-type') ?? '');
    const disposition = String(
      response.getHeader?.('content-disposition') ?? '',
    );

    return (
      contentType.includes('text/event-stream') ||
      contentType.includes('application/octet-stream') ||
      contentType.startsWith('multipart/') ||
      disposition.toLowerCase().includes('attachment')
    );
  }
}

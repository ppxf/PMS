import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AppLoggerService } from './app-logger.service';

interface RequestLike {
  method?: string;
  originalUrl?: string;
  url?: string;
}

interface ResponseLike {
  statusCode?: number;
}

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<RequestLike>();
    const response = http.getResponse<ResponseLike>();
    const method = request.method ?? 'UNKNOWN';
    const url = request.originalUrl ?? request.url ?? '/';
    const startedAt = performance.now();

    return next.handle().pipe(
      tap({
        complete: () => {
          const duration = Math.round(performance.now() - startedAt);
          this.logger.log(
            `${method} ${url} ${response.statusCode ?? 200} ${duration}ms`,
            'HTTP',
          );
        },
        error: () => {
          const duration = Math.round(performance.now() - startedAt);
          this.logger.warn(`${method} ${url} failed ${duration}ms`, 'HTTP');
        },
      }),
    );
  }
}

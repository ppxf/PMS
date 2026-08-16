import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ApiErrorResponse } from '../interfaces/api-response.interface';
import { AppLoggerService } from '../../logger/app-logger.service';

type ErrorPayload = {
  message?: string | string[];
  error?: string;
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly logger: AppLoggerService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const context = host.switchToHttp();
    const request = context.getRequest<{ url: string }>();
    const response = context.getResponse<unknown>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const details = this.getErrorDetails(exception, statusCode);
    const path = request.url;

    const body: ApiErrorResponse = {
      success: false,
      statusCode,
      message: details.message,
      ...(details.error ? { error: details.error } : {}),
      timestamp: new Date().toISOString(),
      path,
    };

    if (statusCode >= 500) {
      const trace = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(`${statusCode} ${path}`, trace, 'ExceptionFilter');
    } else {
      this.logger.warn(`${statusCode} ${path}`, 'ExceptionFilter');
    }

    httpAdapter.reply(response, body, statusCode);
  }

  private getErrorDetails(
    exception: unknown,
    statusCode: number,
  ): Required<Pick<ErrorPayload, 'message'>> & Pick<ErrorPayload, 'error'> {
    if (!(exception instanceof HttpException)) {
      return {
        message: 'Internal server error',
        error: HttpStatus[statusCode],
      };
    }

    const response = exception.getResponse();
    if (typeof response === 'string') {
      return { message: response, error: exception.name };
    }

    const payload = response as ErrorPayload;
    return {
      message: payload.message ?? exception.message,
      error: payload.error ?? exception.name,
    };
  }
}

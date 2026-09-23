import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request } from 'express';

export function configureBodyParsers(
  app: NestExpressApplication,
  apiPrefix: string,
): void {
  const prefix = apiPrefix.replace(/^\/+|\/+$/gu, '');
  const sdkPath = `${prefix ? `/${prefix}` : ''}/sdk`.toLowerCase();
  const isSdk = (request: Request): boolean => {
    const path = request.path.toLowerCase();
    return path === sdkPath || path.startsWith(`${sdkPath}/`);
  };

  // Nest's default parser is disabled at creation so it cannot consume an SDK
  // envelope using the ordinary API limit before these scoped parsers run.
  app.useBodyParser('json', {
    limit: '512kb',
    type: (request: Request) =>
      isSdk(request) && Boolean(request.is('application/json')),
  });
  app.useBodyParser('json', {
    limit: '100kb',
    type: (request: Request) =>
      !isSdk(request) && Boolean(request.is('application/json')),
  });
  app.useBodyParser('urlencoded', { extended: true, limit: '100kb' });
}

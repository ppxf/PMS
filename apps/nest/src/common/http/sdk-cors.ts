import type { CorsOptionsDelegate } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { Request } from 'express';

export function isSdkUploadPath(path: string, apiPrefix = 'api'): boolean {
  const prefix = apiPrefix.toLowerCase().split('/').filter(Boolean);
  const parts = path.toLowerCase().replace(/\/$/, '').split('/');
  if (parts[0] !== '' || !prefix.every((part, i) => parts[i + 1] === part))
    return false;
  const rest = parts.slice(prefix.length + 1);
  let projectId = rest[1];
  if (rest.length === 3) {
    try {
      projectId = decodeURIComponent(projectId);
    } catch {
      return false;
    }
  }
  return (
    (rest.length === 2 && rest[0] === 'sdk' && rest[1] === 'check') ||
    (rest.length === 3 &&
      rest[0] === 'sdk' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        projectId,
      ) &&
      /^(envelope|check)$/.test(rest[2]))
  );
}

export function sdkCors(
  staticOrigins: string[],
  apiPrefix = 'api',
): CorsOptionsDelegate<Request> {
  return (request, callback) => {
    if (
      isSdkUploadPath(request.path, apiPrefix) &&
      ['POST', 'OPTIONS'].includes(request.method)
    ) {
      callback(null, {
        origin: '*',
        credentials: false,
        methods: ['POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'X-PMS-Key'],
      });
      return;
    }
    callback(null, {
      origin: Boolean(
        request.headers.origin &&
        staticOrigins.includes(request.headers.origin),
      ),
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });
  };
}

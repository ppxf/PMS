import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export function parseAuditQuery(query: Record<string, unknown>) {
  const fail = () => {
    throw new BadRequestException('Invalid audit filter');
  };
  const integer = (key: string, fallback: number, max: number) => {
    const value = query[key];
    if (value === undefined) return fallback;
    if (
      typeof value !== 'string' ||
      !/^[1-9]\d*$/.test(value) ||
      Number(value) > max
    )
      return fail();
    return Number(value);
  };
  const text = (key: string) => {
    const value = query[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !value.trim() || value.length > 200)
      return fail();
    return value.trim();
  };
  const projectId = text('projectId');
  if (
    projectId &&
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
      projectId,
    )
  )
    fail();
  const from = text('from');
  const to = text('to');
  for (const value of [from, to])
    if (
      value &&
      (!/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value) ||
        !Number.isFinite(Date.parse(value)))
    )
      fail();
  for (const value of [from, to]) {
    if (value) {
      const day = value.slice(0, 10);
      if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day)
        fail();
    }
  }
  if (from && to && Date.parse(from) > Date.parse(to)) fail();
  return {
    projectId,
    action: text('action'),
    actor: text('actor'),
    from,
    to,
    page: integer('page', 1, 1000000),
    pageSize: integer('pageSize', 20, 100),
  };
}

export function auditMetadata(request: {
  method: string;
  route?: { path?: unknown };
  headers: Record<string, unknown>;
  [key: string]: unknown;
}) {
  const route =
    typeof request.route?.path === 'string' ? request.route.path : '/unknown';
  const supplied = request.headers['x-request-id'];
  return {
    action: `${request.method} ${route}`.slice(0, 300),
    requestId:
      typeof supplied === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(supplied)
        ? supplied
        : null,
  };
}

export const requestIdentifier = (value: string | null) =>
  value ?? randomUUID();

import { Injectable, PipeTransform } from '@nestjs/common';
import {
  isoTime,
  jsonObject,
  reject,
  validId,
} from '../traces/traces-validation';
import { LOG_LEVELS } from './logs-contract';
import type { LogQuery, LogsEnvelope } from './logs-contract';
const uuid = (value: unknown) =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    value,
  );
function text(value: unknown, max: number): asserts value is string {
  if (typeof value !== 'string' || !value.length || value.length > max)
    reject('Invalid log string');
}
function attribute(key: unknown, value: unknown) {
  text(key, 64);
  if (['__proto__', 'prototype', 'constructor'].includes(key))
    reject('Reserved log attribute');
  if (!(
    (typeof value === 'string' && value.length <= 256) ||
    typeof value === 'boolean' ||
    (typeof value === 'number' &&
      Number.isFinite(value) &&
      Math.abs(value) <= Number.MAX_SAFE_INTEGER)
  ))
    reject('Log attributes must be bounded scalar values');
}
@Injectable()
export class LogsEnvelopePipe implements PipeTransform<unknown, LogsEnvelope> {
  transform(input: unknown): LogsEnvelope {
    const root = jsonObject(input, [
      'version',
      'type',
      'sentAt',
      'eventId',
      'logs',
    ]);
    if (root.version !== 1 || root.type !== 'logs' || !uuid(root.eventId))
      reject('Invalid logs envelope');
    const now = Date.now(),
      sentAt = isoTime(root.sentAt);
    if (sentAt < now - 86400000 || sentAt > now + 300000)
      reject('Log batch outside retry window');
    if (
      !Array.isArray(root.logs) ||
      root.logs.length < 1 ||
      root.logs.length > 50
    )
      reject('Expected 1 to 50 logs');
    const ids = new Set<string>();
    for (const inputLog of root.logs) {
      const log = jsonObject(inputLog, [
        'logId',
        'timestamp',
        'level',
        'message',
        'attributes',
        'environment',
        'release',
        'traceId',
        'spanId',
      ]);
      if (!uuid(log.logId) || ids.has(String(log.logId)))
        reject('Invalid or duplicate log ID');
      ids.add(String(log.logId));
      if (!(LOG_LEVELS as readonly unknown[]).includes(log.level))
        reject('Invalid log level');
      text(log.message, 4096);
      const timestamp = isoTime(log.timestamp);
      if (
        timestamp < now - 86400000 ||
        timestamp > now + 300000 ||
        timestamp > sentAt + 300000
      )
        reject('Log timestamp outside ingestion window');
      for (const key of ['environment', 'release'])
        if (log[key] !== undefined) text(log[key], 128);
      if (
        (log.traceId !== undefined || log.spanId !== undefined) &&
        (!validId(log.traceId, 32) || !validId(log.spanId, 16))
      )
        reject('Invalid log trace context');
      const attributes = jsonObject(log.attributes);
      if (Object.keys(attributes).length > 20)
        reject('Too many log attributes');
      Object.entries(attributes).forEach(([key, value]) =>
        attribute(key, value),
      );
      if (Buffer.byteLength(JSON.stringify(log), 'utf8') > 8192)
        reject('Log record too large');
    }
    if (Buffer.byteLength(JSON.stringify(root), 'utf8') > 262144)
      reject('Log envelope too large');
    return root as unknown as LogsEnvelope;
  }
}
@Injectable()
export class LogQueryPipe implements PipeTransform<unknown, LogQuery> {
  transform(input: unknown): LogQuery {
    const q = jsonObject(input, [
      'start',
      'end',
      'search',
      'levels',
      'environment',
      'traceId',
      'filters',
      'intervalSeconds',
      'page',
      'pageSize',
      'sortDirection',
    ]);
    const start = isoTime(q.start),
      end = isoTime(q.end);
    if (start >= end || end - start > 7 * 86400000)
      reject('Log range must be between 0 and 7 days');
    if (q.search !== undefined) text(q.search, 256);
    if (q.environment !== undefined) text(q.environment, 128);
    if (q.traceId !== undefined && !validId(q.traceId, 32))
      reject('Invalid trace filter');
    const levels = q.levels ?? [];
    if (
      !Array.isArray(levels) ||
      levels.length > 6 ||
      new Set(levels).size !== levels.length ||
      levels.some(
        (level) => !(LOG_LEVELS as readonly unknown[]).includes(level),
      )
    )
      reject('Invalid log levels');
    const filters = q.filters ?? [];
    if (!Array.isArray(filters) || filters.length > 10)
      reject('Too many log filters');
    filters.forEach((inputFilter) => {
      const filter = jsonObject(inputFilter, ['key', 'value']);
      attribute(filter.key, filter.value);
    });
    const intervalSeconds =
      q.intervalSeconds ?? Math.max(60, Math.ceil((end - start) / 120000));
    if (
      typeof intervalSeconds !== 'number' ||
      !Number.isInteger(intervalSeconds) ||
      intervalSeconds < 60 ||
      intervalSeconds > 86400 ||
      Math.ceil((end - start) / intervalSeconds / 1000) > 500
    )
      reject('Invalid log interval (maximum 500 buckets)');
    const page = q.page ?? 1,
      pageSize = q.pageSize ?? 20;
    if (
      !Number.isInteger(page) ||
      Number(page) < 1 ||
      Number(page) > 5000 ||
      !Number.isInteger(pageSize) ||
      Number(pageSize) < 1 ||
      Number(pageSize) > 100
    )
      reject('Invalid log pagination');
    const sortDirection = q.sortDirection ?? 'desc';
    if (sortDirection !== 'asc' && sortDirection !== 'desc')
      reject('Invalid log sort direction');
    return {
      ...q,
      levels,
      filters,
      intervalSeconds,
      page,
      pageSize,
      sortDirection,
    } as LogQuery;
  }
}

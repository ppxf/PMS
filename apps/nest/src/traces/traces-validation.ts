import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import {
  MonitoringSpan,
  SPAN_FIELD_MAP,
  SpanQuery,
  TransactionEnvelope,
} from './traces-contract';

export function reject(message: string): never {
  throw new BadRequestException(message);
}
export function jsonObject(
  value: unknown,
  keys?: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    reject('Expected a JSON object');
  const object = value as Record<string, unknown>;
  if (
    Object.keys(object).some(
      (key) =>
        ['__proto__', 'prototype', 'constructor'].includes(key) ||
        (keys && !keys.includes(key)),
    )
  )
    reject('Unknown or reserved field');
  return object;
}
export function isoTime(value: unknown): number {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    reject('Invalid ISO timestamp');
  return Date.parse(value);
}
export function validId(value: unknown, length: number): boolean {
  return (
    typeof value === 'string' &&
    new RegExp(`^[a-f0-9]{${length}}$`).test(value) &&
    !/^0+$/.test(value)
  );
}
function text(value: unknown, max: number): asserts value is string {
  if (typeof value !== 'string' || !value.length || value.length > max)
    reject('Invalid bounded string');
}
function number(
  value: unknown,
  max = Number.MAX_SAFE_INTEGER,
): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max
  )
    reject('Invalid nonnegative finite number');
}
function integer(
  value: unknown,
  min: number,
  max: number,
): asserts value is number {
  number(value, max);
  if (!Number.isInteger(value) || value < min) reject('Invalid integer');
}
const spanKeys = [
  'traceId',
  'spanId',
  'parentSpanId',
  'isTransaction',
  'op',
  'name',
  'startTime',
  'endTime',
  'durationMs',
  'status',
  'environment',
  'release',
  'pageRoute',
  'httpMethod',
  'httpStatusCode',
  'httpRoute',
  'ttfbMs',
  'transferSize',
  'encodedBodySize',
  'decodedBodySize',
  'truncated',
  'endReason',
  'droppedSpanCount',
  'attributes',
];

@Injectable()
export class TransactionEnvelopePipe implements PipeTransform<
  unknown,
  TransactionEnvelope
> {
  transform(value: unknown): TransactionEnvelope {
    const root = jsonObject(value, [
      'version',
      'type',
      'sentAt',
      'transaction',
    ]);
    if (root.version !== 1 || root.type !== 'transaction')
      reject('Invalid transaction envelope');
    const sentAt = isoTime(root.sentAt);
    if (sentAt < Date.now() - 24 * 3600000 || sentAt > Date.now() + 5 * 60000)
      reject('Batch sentAt outside retry window');
    const transaction = jsonObject(root.transaction, ['eventId', 'spans']);
    if (
      typeof transaction.eventId !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        transaction.eventId,
      )
    )
      reject('Invalid batch eventId');
    if (
      !Array.isArray(transaction.spans) ||
      transaction.spans.length < 1 ||
      transaction.spans.length > 200
    )
      reject('A batch must contain 1 to 200 spans');
    if (Buffer.byteLength(JSON.stringify(value)) > 256 * 1024)
      reject('Transaction exceeds 256 KiB');
    const identities = new Map<string, Record<string, unknown>>();
    const spans = transaction.spans.map((entry: unknown) => {
      const span = jsonObject(entry, spanKeys);
      if (
        !validId(span.traceId, 32) ||
        !validId(span.spanId, 16) ||
        (span.parentSpanId !== undefined && !validId(span.parentSpanId, 16))
      )
        reject('Invalid trace/span ID');
      if (
        typeof span.isTransaction !== 'boolean' ||
        typeof span.truncated !== 'boolean'
      )
        reject('Invalid boolean');
      text(span.op, 64);
      text(span.name, 512);
      text(span.endReason, 64);
      const start = isoTime(span.startTime);
      const end = isoTime(span.endTime);
      if (
        end < start ||
        end - start > 24 * 3600000 ||
        end > Date.now() + 5 * 60000
      )
        reject('Invalid span time range');
      number(span.durationMs, 24 * 3600000);
      if (
        !['ok', 'error', 'cancelled', 'deadline_exceeded', 'unknown'].includes(
          span.status as string,
        )
      )
        reject('Invalid status');
      integer(span.droppedSpanCount, 0, 1000000);
      for (const key of [
        'environment',
        'release',
        'pageRoute',
        'httpMethod',
        'httpRoute',
      ]) {
        if (span[key] !== undefined)
          text(span[key], key === 'httpMethod' ? 16 : 512);
      }
      if (span.httpStatusCode !== undefined)
        integer(span.httpStatusCode, 100, 599);
      for (const key of [
        'ttfbMs',
        'transferSize',
        'encodedBodySize',
        'decodedBodySize',
      ])
        if (span[key] !== undefined) number(span[key]);
      const attributes = jsonObject(span.attributes);
      if (Object.keys(attributes).length > 50) reject('Too many attributes');
      for (const [key, attribute] of Object.entries(attributes)) {
        text(key, 64);
        if (!['string', 'number', 'boolean'].includes(typeof attribute))
          reject('Attributes must be scalar');
        if (typeof attribute === 'string' && attribute.length > 256)
          reject('Attribute too long');
        if (typeof attribute === 'number' && !Number.isFinite(attribute))
          reject('Invalid attribute number');
        if (
          /authorization|cookie|token|session|password|secret|credential/i.test(
            key,
          )
        )
          attributes[key] = '[Filtered]';
      }
      span.startTime = new Date(start).toISOString();
      span.endTime = new Date(end).toISOString();
      for (const key of ['pageRoute', 'httpRoute'])
        if (typeof span[key] === 'string')
          span[key] = span[key].split(/[?#]/)[0];
      const identity = `${String(span.traceId)}:${String(span.spanId)}`;
      if (identities.has(identity)) reject('Duplicate span in batch');
      identities.set(identity, span);
      return span as unknown as MonitoringSpan;
    });
    if (!spans.some((span) => span.isTransaction))
      reject('Batch must contain a transaction root');
    if (new Set(spans.map((span) => span.traceId)).size > 1)
      reject('A transaction batch must belong to one trace');
    for (const span of spans) {
      const visited = new Set<string>();
      let current: Record<string, unknown> | undefined =
        span as unknown as Record<string, unknown>;
      while (current) {
        const id = `${String(current.traceId)}:${String(current.spanId)}`;
        if (visited.has(id)) reject('Cyclic span ancestry');
        visited.add(id);
        current = identities.get(
          `${String(current.traceId)}:${String(current.parentSpanId)}`,
        );
      }
    }
    return {
      version: 1,
      type: 'transaction',
      sentAt: new Date(sentAt).toISOString(),
      transaction: { eventId: transaction.eventId.toLowerCase(), spans },
    };
  }
}

@Injectable()
export class SpanQueryPipe implements PipeTransform<unknown, SpanQuery> {
  transform(value: unknown): SpanQuery {
    const input = jsonObject(value, [
      'start',
      'end',
      'filters',
      'metrics',
      'groupBy',
      'primaryMetric',
      'limit',
      'interval',
      'page',
      'pageSize',
      'sortBy',
      'sortDirection',
    ]);
    const start = isoTime(input.start);
    const end = isoTime(input.end);
    if (end <= start || end - start > 7 * 24 * 3600000)
      reject('Query range must be positive and at most 7 days');
    const filters = input.filters ?? [];
    const metrics = input.metrics ?? [{ function: 'count', field: 'spans' }];
    const groupBy = input.groupBy ?? [];
    if (
      !Array.isArray(filters) ||
      filters.length > 20 ||
      !Array.isArray(metrics) ||
      metrics.length < 1 ||
      metrics.length > 5 ||
      !Array.isArray(groupBy) ||
      groupBy.length > 2 ||
      new Set(groupBy).size !== groupBy.length
    )
      reject('Query complexity exceeds limits');
    for (const entry of filters) {
      const filter = jsonObject(entry, ['field', 'operator', 'value']);
      const field = SPAN_FIELD_MAP.get(filter.field as string);
      if (!field || !field.operators.includes(filter.operator as never))
        reject('Unsupported field/filter operator');
      if (filter.operator === 'exists') {
        if (filter.value !== undefined && typeof filter.value !== 'boolean')
          reject('exists requires a boolean');
        continue;
      }
      const values = ['in', 'not_in'].includes(filter.operator as string)
        ? filter.value
        : [filter.value];
      if (!Array.isArray(values) || values.length < 1 || values.length > 50)
        reject('Invalid filter value set');
      for (const item of values) {
        if (
          typeof item !== field.type ||
          (typeof item === 'number' && !Number.isFinite(item)) ||
          (typeof item === 'string' && item.length > 512)
        )
          reject('Wrong filter scalar type');
      }
    }
    for (const entry of metrics) {
      const metric = jsonObject(entry, ['function', 'field']);
      if (
        !SPAN_FIELD_MAP.get(metric.field as string)?.aggregations.includes(
          metric.function as never,
        )
      )
        reject('Unsupported metric');
    }
    for (const field of groupBy)
      if (typeof field !== 'string' || !SPAN_FIELD_MAP.get(field)?.groupable)
        reject('Unsupported groupBy');
    integer(input.primaryMetric ?? 0, 0, metrics.length - 1);
    integer(input.limit ?? 5, 1, 10);
    integer(input.page ?? 1, 1, 1000);
    integer(input.pageSize ?? 50, 1, 100);
    if (
      input.interval !== undefined &&
      !['auto', '1m', '30m', '1h', '3h', '6h', '1d'].includes(
        input.interval as string,
      )
    )
      reject('Unsupported interval');
    if (
      input.sortBy !== undefined &&
      !['startTime', 'durationMs'].includes(input.sortBy as string)
    )
      integer(input.sortBy, 0, metrics.length - 1);
    if (
      input.sortDirection !== undefined &&
      !['asc', 'desc'].includes(input.sortDirection as string)
    )
      reject('Unsupported sort direction');
    return {
      ...input,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      filters,
      metrics,
      groupBy,
      primaryMetric: input.primaryMetric ?? 0,
      limit: input.limit ?? 5,
      page: input.page ?? 1,
      pageSize: input.pageSize ?? 50,
    } as SpanQuery;
  }
}

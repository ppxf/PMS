import { Injectable, PipeTransform } from '@nestjs/common';
import {
  isoTime,
  jsonObject,
  reject,
  validId,
} from '../traces/traces-validation';
import {
  MetricQuery,
  MetricsEnvelope,
  TraceMetricsQuery,
  METRIC_AGGREGATIONS,
  MetricType,
  MetricAggregation,
} from './metrics-contract';
import { metricFilterField } from './metrics-fields';

function text(value: unknown, max: number): asserts value is string {
  if (typeof value !== 'string' || !value.length || value.length > max)
    reject('Invalid metric string');
}
function scalar(value: unknown) {
  if (!(
    (typeof value === 'string' && value.length <= 256) ||
    typeof value === 'boolean' ||
    (typeof value === 'number' &&
      Number.isFinite(value) &&
      Math.abs(value) <= Number.MAX_SAFE_INTEGER)
  ))
    reject('Invalid metric attribute');
}
function attributeKey(value: unknown) {
  text(value, 64);
  if (['__proto__', 'prototype', 'constructor'].includes(value))
    reject('Reserved attribute');
}
function metricIdentity(row: Record<string, unknown>) {
  text(row.name, 128);
  text(row.unit, 32);
  if (
    !/^[a-zA-Z][a-zA-Z0-9_./-]*$/.test(row.name) ||
    !/^[a-zA-Z][a-zA-Z0-9_./-]*$/.test(row.unit) ||
    !['count', 'gauge', 'distribution'].includes(String(row.type))
  )
    reject('Invalid metric identity');
}
@Injectable()
export class MetricsEnvelopePipe implements PipeTransform<
  unknown,
  MetricsEnvelope
> {
  transform(input: unknown): MetricsEnvelope {
    const root = jsonObject(input, [
      'version',
      'type',
      'sentAt',
      'eventId',
      'samples',
    ]);
    if (root.version !== 1 || root.type !== 'metrics')
      reject('Invalid metrics envelope');
    const sentAt = isoTime(root.sentAt);
    if (sentAt < Date.now() - 86400000 || sentAt > Date.now() + 300000)
      reject('Metric batch outside retry window');
    if (
      typeof root.eventId !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        root.eventId,
      )
    )
      reject('Invalid metric batch ID');
    if (
      !Array.isArray(root.samples) ||
      !root.samples.length ||
      root.samples.length > 100
    )
      reject('Expected 1 to 100 metric samples');
    for (const inputSample of root.samples) {
      const row = jsonObject(inputSample, [
        'name',
        'type',
        'unit',
        'value',
        'timestamp',
        'attributes',
        'environment',
        'release',
        'traceId',
        'spanId',
      ]);
      metricIdentity(row);
      if (
        typeof row.value !== 'number' ||
        !Number.isFinite(row.value) ||
        Math.abs(row.value) > Number.MAX_SAFE_INTEGER ||
        (row.type === 'count' && row.value < 0)
      )
        reject('Invalid metric value');
      const time = isoTime(row.timestamp);
      if (
        time < Date.now() - 86400000 ||
        time > Date.now() + 300000 ||
        time > sentAt + 300000
      )
        reject('Metric timestamp outside ingestion window');
      for (const key of ['environment', 'release'])
        if (row[key] !== undefined) text(row[key], 128);
      if (
        (row.traceId !== undefined || row.spanId !== undefined) &&
        (!validId(row.traceId, 32) || !validId(row.spanId, 16))
      )
        reject('Invalid metric trace context');
      const attributes = jsonObject(row.attributes);
      if (Object.keys(attributes).length > 30)
        reject('Too many metric attributes');
      Object.entries(attributes).forEach(([key, value]) => {
        attributeKey(key);
        scalar(value);
      });
    }
    if (Buffer.byteLength(JSON.stringify(root), 'utf8') > 262144)
      reject('Metric envelope too large');
    return root as unknown as MetricsEnvelope;
  }
}
@Injectable()
export class MetricQueryPipe implements PipeTransform<unknown, MetricQuery> {
  transform(input: unknown): MetricQuery {
    const q = jsonObject(input, [
      'traceId',
      'spanId',
      'start',
      'end',
      'name',
      'type',
      'unit',
      'aggregation',
      'filters',
      'groupBy',
      'intervalSeconds',
      'page',
      'pageSize',
    ]);
    const start = isoTime(q.start),
      end = isoTime(q.end);
    if (start >= end || end - start > 7 * 86400000)
      reject('Metric range must be between 0 and 7 days');
    metricIdentity(q);
    if (q.traceId !== undefined && !validId(q.traceId, 32))
      reject('Invalid traceId');
    if (
      q.spanId !== undefined &&
      (!validId(q.spanId, 16) || q.traceId === undefined)
    )
      reject('spanId requires a valid traceId');
    if (
      ![
        'sum',
        'avg',
        'min',
        'max',
        'count',
        'p50',
        'p95',
        'p99',
        'last',
      ].includes(String(q.aggregation))
    )
      reject('Invalid metric aggregation');
    if (
      !METRIC_AGGREGATIONS[q.type as MetricType].includes(
        q.aggregation as MetricAggregation,
      )
    )
      reject('Aggregation is not supported for this metric type');
    if (q.groupBy !== undefined) {
      const fields = Array.isArray(q.groupBy) ? q.groupBy : [q.groupBy];
      if (
        !fields.length ||
        fields.length > 5 ||
        new Set(fields).size !== fields.length
      )
        reject('Expected 1 to 5 distinct group fields');
      for (const field of fields) {
        text(field, 75);
        attributeKey(field.startsWith('attributes.') ? field.slice(11) : field);
      }
    }
    const filters = q.filters ?? [];
    if (!Array.isArray(filters) || filters.length > 10)
      reject('Too many metric filters');
    filters.forEach((inputFilter) => {
      const filter = jsonObject(inputFilter, ['field', 'operator', 'value']);
      const field = metricFilterField(filter.field);
      if (!field || !field.operators.includes(filter.operator as never))
        reject('Unsupported metric field/operator');
      if (filter.operator === 'exists') {
        if (filter.value !== undefined && typeof filter.value !== 'boolean')
          reject('exists requires a boolean');
        return;
      }
      const values =
        filter.operator === 'in' || filter.operator === 'not_in'
          ? filter.value
          : [filter.value];
      if (!Array.isArray(values) || !values.length || values.length > 50)
        reject('Expected 1 to 50 filter values');
      for (const value of values) {
        scalar(value);
        if (field.type !== 'mixed' && typeof value !== field.type)
          reject('Wrong metric filter value type');
        if (filter.operator === 'contains' && typeof value !== 'string')
          reject('contains requires text');
        if (
          ['gt', 'gte', 'lt', 'lte'].includes(String(filter.operator)) &&
          typeof value !== 'number'
        )
          reject('Comparison requires a number');
      }
    });
    const interval =
      q.intervalSeconds ?? Math.max(60, Math.ceil((end - start) / 1000 / 120));
    if (
      typeof interval !== 'number' ||
      !Number.isInteger(interval) ||
      interval < 60 ||
      interval > 86400 ||
      Math.ceil((end - start) / 1000 / interval) > 500
    )
      reject('Invalid metric interval (maximum 500 buckets)');
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
      reject('Invalid metric pagination');
    return {
      ...q,
      filters,
      intervalSeconds: interval,
      page,
      pageSize,
    } as MetricQuery;
  }
}

@Injectable()
export class TraceMetricsQueryPipe implements PipeTransform<
  unknown,
  TraceMetricsQuery
> {
  transform(input: unknown): TraceMetricsQuery {
    const q = jsonObject(input, ['page', 'pageSize', 'search', 'spanId']);
    function pageNumber(value: unknown, fallback: number, max: number): number {
      const number =
        value === undefined
          ? fallback
          : typeof value === 'string' && /^[1-9][0-9]*$/.test(value)
            ? Number(value)
            : value;
      if (
        typeof number !== 'number' ||
        !Number.isInteger(number) ||
        number < 1 ||
        number > max
      )
        reject('Invalid metric pagination');
      return number;
    }
    if (q.search !== undefined) text(q.search, 128);
    if (q.spanId !== undefined) {
      text(q.spanId, 16);
      if (!validId(q.spanId, 16)) reject('Invalid spanId');
    }
    return {
      page: pageNumber(q.page, 1, 5000),
      pageSize: pageNumber(q.pageSize, 20, 100),
      ...(q.search !== undefined ? { search: q.search } : {}),
      ...(q.spanId !== undefined ? { spanId: q.spanId } : {}),
    };
  }
}

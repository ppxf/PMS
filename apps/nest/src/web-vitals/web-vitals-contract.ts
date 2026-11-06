import { Injectable, PipeTransform } from '@nestjs/common';
import {
  isoTime,
  jsonObject,
  reject,
  validId,
} from '../traces/traces-validation';
export const VITAL_NAMES = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'] as const;
export interface WebVitalsEnvelope {
  version: 1;
  type: 'web_vitals';
  eventId: string;
  sentAt: string;
  page: {
    id: string;
    startedAt: string;
    route: string;
    navigationType: string;
    environment?: string;
    release?: string;
    browser?: string;
    device?: string;
    traceId?: string;
    spanId?: string;
  };
  measurements: {
    name: (typeof VITAL_NAMES)[number];
    metricId: string;
    revision: number;
    value: number;
    observedAt: string;
    attribution: Record<string, string | number | boolean>;
  }[];
}
const uuid = (v: unknown) =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
function bounded(v: unknown, max: number) {
  if (typeof v !== 'string' || !v.length || v.length > max)
    reject('Invalid bounded string');
}
@Injectable()
export class WebVitalsEnvelopePipe implements PipeTransform {
  transform(input: unknown): WebVitalsEnvelope {
    const e = jsonObject(input, [
      'version',
      'type',
      'eventId',
      'sentAt',
      'page',
      'measurements',
    ]);
    if (e.version !== 1 || e.type !== 'web_vitals' || !uuid(e.eventId))
      reject('Invalid Web Vitals envelope');
    isoTime(e.sentAt);
    const p = jsonObject(e.page, [
      'id',
      'startedAt',
      'route',
      'navigationType',
      'environment',
      'release',
      'browser',
      'device',
      'traceId',
      'spanId',
    ]);
    if (!uuid(p.id)) reject('Invalid page ID');
    isoTime(p.startedAt);
    bounded(p.route, 2048);
    bounded(p.navigationType, 64);
    for (const k of ['environment', 'release', 'browser'])
      if (p[k] !== undefined) bounded(p[k], 128);
    if (
      p.device !== undefined &&
      !['desktop', 'mobile', 'tablet', 'unknown'].includes(p.device as string)
    )
      reject('Invalid device');
    if (p.traceId !== undefined && !validId(p.traceId, 32))
      reject('Invalid trace ID');
    if (p.spanId !== undefined && (!p.traceId || !validId(p.spanId, 16)))
      reject('Invalid span ID');
    if (!Array.isArray(e.measurements) || e.measurements.length > 5)
      reject('Invalid measurements');
    const seen = new Set();
    for (const item of e.measurements) {
      const m = jsonObject(item, [
        'name',
        'metricId',
        'revision',
        'value',
        'observedAt',
        'attribution',
      ]);
      if (!VITAL_NAMES.includes(m.name as never) || seen.has(m.name))
        reject('Invalid or duplicate metric');
      seen.add(m.name);
      bounded(m.metricId, 128);
      if (
        !Number.isSafeInteger(m.revision) ||
        (m.revision as number) < 1 ||
        (m.revision as number) > 2147483647 ||
        typeof m.value !== 'number' ||
        !Number.isFinite(m.value) ||
        m.value < 0
      )
        reject('Invalid measurement');
      if (isoTime(m.observedAt) < isoTime(p.startedAt))
        reject('Measurement predates page');
      const a = jsonObject(m.attribution);
      if (Object.keys(a).length > 32) reject('Too many attribution fields');
      for (const [k, v] of Object.entries(a))
        if (
          k.length > 128 ||
          !['string', 'number', 'boolean'].includes(typeof v) ||
          (typeof v === 'string' && v.length > 2048) ||
          (typeof v === 'number' && !Number.isFinite(v))
        )
          reject('Invalid attribution');
    }
    return e as unknown as WebVitalsEnvelope;
  }
}

import { Injectable, PipeTransform } from '@nestjs/common';
import {
  isoTime,
  jsonObject,
  reject,
  validId,
} from '../traces/traces-validation';
import type {
  MonitoringProfile,
  ProfileEnvelope,
  ProfileQuery,
  ProfileDiagnosticEnvelope,
} from './profiles-contract';

@Injectable()
export class ProfileDiagnosticPipe implements PipeTransform<
  unknown,
  ProfileDiagnosticEnvelope
> {
  transform(input: unknown): ProfileDiagnosticEnvelope {
    const value = jsonObject(input, ['version', 'type', 'sentAt', 'reason']);
    if (
      value.version !== 1 ||
      value.type !== 'profile_diagnostic' ||
      (value.reason !== 'permission_denied' && value.reason !== 'start_failed')
    )
      reject('Invalid profile diagnostic');
    const sentAt = isoTime(value.sentAt);
    if (sentAt < Date.now() - 86400000 || sentAt > Date.now() + 300000)
      reject('Profile diagnostic outside retry window');
    return {
      version: 1,
      type: 'profile_diagnostic',
      sentAt: new Date(sentAt).toISOString(),
      reason: value.reason,
    };
  }
}
export function validProfileId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value,
    )
  );
}
function text(
  value: unknown,
  max: number,
  empty = false,
): asserts value is string {
  if (
    typeof value !== 'string' ||
    (!empty && !value.length) ||
    value.length > max
  )
    reject('Invalid bounded profile string');
}
function number(
  value: unknown,
  min: number,
  max: number,
): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    reject('Invalid profile number');
}
function integer(
  value: unknown,
  min: number,
  max: number,
): asserts value is number {
  number(value, min, max);
  if (!Number.isInteger(value)) reject('Invalid profile index/integer');
}
function array(value: unknown, max: number): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > max)
    reject('Profile array exceeds limits');
}
@Injectable()
export class ProfileEnvelopePipe implements PipeTransform<
  unknown,
  ProfileEnvelope
> {
  transform(input: unknown): ProfileEnvelope {
    const root = jsonObject(input, ['version', 'type', 'sentAt', 'profile']);
    if (root.version !== 1 || root.type !== 'profile')
      reject('Invalid profile envelope');
    if (Buffer.byteLength(JSON.stringify(input)) > 256 * 1024)
      reject('Profile exceeds 256 KiB');
    const now = Date.now(),
      sentAt = isoTime(root.sentAt);
    if (sentAt < now - 86400000 || sentAt > now + 300000)
      reject('Profile sentAt outside retry window');
    const p = jsonObject(root.profile, [
      'profileId',
      'startedAt',
      'durationMs',
      'sampleIntervalMs',
      'name',
      'environment',
      'release',
      'traceId',
      'spanId',
      'truncated',
      'resources',
      'frames',
      'stacks',
      'samples',
    ]);
    if (!validProfileId(p.profileId)) reject('Invalid profileId');
    const startedAt = isoTime(p.startedAt);
    number(p.durationMs, 0, 30000);
    number(p.sampleIntervalMs, Number.MIN_VALUE, 30000);
    if (startedAt < now - 86400000 || startedAt + p.durationMs > now + 300000)
      reject('Invalid profile time range');
    text(p.name, 512);
    for (const key of ['environment', 'release'])
      if (p[key] !== undefined) text(p[key], 128);
    if (
      (p.traceId !== undefined && !validId(p.traceId, 32)) ||
      (p.spanId !== undefined && !validId(p.spanId, 16))
    )
      reject('Invalid profile trace/span ID');
    if (typeof p.truncated !== 'boolean') reject('Invalid profile truncated');
    array(p.resources, 2000);
    array(p.frames, 2000);
    array(p.stacks, 5000);
    array(p.samples, 10000);
    for (const resource of p.resources) text(resource, 8192, true);
    for (const value of p.frames) {
      const f = jsonObject(value, ['name', 'resourceId', 'line', 'column']);
      text(f.name, 512, true);
      if (f.resourceId !== undefined)
        integer(f.resourceId, 0, p.resources.length - 1);
      for (const key of ['line', 'column'])
        if (f[key] !== undefined) integer(f[key], 0, Number.MAX_SAFE_INTEGER);
    }
    const depths: number[] = [];
    for (const [index, value] of p.stacks.entries()) {
      const s = jsonObject(value, ['frameId', 'parentId']);
      integer(s.frameId, 0, p.frames.length - 1);
      if (s.parentId !== undefined) integer(s.parentId, 0, index - 1);
      const depth = s.parentId === undefined ? 1 : depths[s.parentId] + 1;
      if (depth > 128) reject('Profile stack exceeds maximum depth');
      depths.push(depth);
    }
    let previous = 0;
    for (const value of p.samples) {
      const s = jsonObject(value, ['timestamp', 'stackId']);
      number(s.timestamp, previous, p.durationMs);
      previous = s.timestamp;
      if (s.stackId !== undefined) integer(s.stackId, 0, p.stacks.length - 1);
    }
    return {
      version: 1,
      type: 'profile',
      sentAt: new Date(sentAt).toISOString(),
      profile: {
        ...p,
        profileId: p.profileId.toLowerCase(),
        startedAt: new Date(startedAt).toISOString(),
      } as unknown as MonitoringProfile,
    };
  }
}
@Injectable()
export class ProfileQueryPipe implements PipeTransform<unknown, ProfileQuery> {
  transform(input: unknown): ProfileQuery {
    const q = jsonObject(input, [
      'start',
      'end',
      'environment',
      'search',
      'traceId',
      'page',
      'pageSize',
    ]);
    const start = isoTime(q.start),
      end = isoTime(q.end);
    if (end <= start || end - start > 31 * 86400000)
      reject('Profile query range must be positive and at most 31 days');
    integer(q.page ?? 1, 1, 1000000);
    integer(q.pageSize ?? 20, 1, 100);
    if (q.environment !== undefined) text(q.environment, 128);
    if (q.search !== undefined) text(q.search, 512, true);
    if (q.traceId !== undefined && !validId(q.traceId, 32))
      reject('Invalid profile traceId');
    return {
      ...q,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      page: q.page ?? 1,
      pageSize: q.pageSize ?? 20,
    } as ProfileQuery;
  }
}
@Injectable()
export class UpdateProfilesPipe implements PipeTransform<
  unknown,
  { profilesEnabled: boolean }
> {
  transform(input: unknown) {
    const value = jsonObject(input, ['profilesEnabled']);
    if (typeof value.profilesEnabled !== 'boolean')
      reject('profilesEnabled must be a boolean');
    return { profilesEnabled: value.profilesEnabled };
  }
}

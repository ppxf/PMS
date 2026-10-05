import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { validateSync } from 'class-validator';
import { propagationTargets } from '../monitoring-projects/dto/propagation-settings.pipe';
import {
  BrowserContextDto,
  BrowserEventContextsDto,
  CultureContextDto,
  DeviceContextDto,
  ErrorExceptionDto,
  IngestEnvelopeDto,
  MemoryContextDto,
  MonitoringErrorEventDto,
  OperatingSystemContextDto,
  RequestContextDto,
  SdkMetadataDto,
} from './dto/ingest-envelope.dto';

function rawObject(
  value: unknown,
  path: string,
  allowedKeys?: readonly string[],
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BadRequestException(`${path} must be a JSON object`);
  }
  if (
    allowedKeys &&
    Object.keys(value).some((key) => !allowedKeys.includes(key))
  ) {
    throw new BadRequestException(`${path} contains an unknown field`);
  }
  return value as Record<string, unknown>;
}

function safeMap(value: unknown, path: string): Record<string, unknown> {
  const map = rawObject(value, path);
  if (Object.keys(map).some((key) => ['__proto__', 'prototype', 'constructor'].includes(key))) {
    throw new BadRequestException(`${path} contains a reserved key`);
  }
  return map;
}

const sensitiveNameParts = [
  'authorization', 'cookie', 'set-cookie', 'token', 'session', 'password',
  'passwd', 'secret', 'credential', 'jwt', 'auth',
];

function sanitizeContextMap(value: unknown, path: string): Record<string, string> {
  const map = safeMap(value, path);
  return Object.fromEntries(Object.entries(map).map(([key, entry]) => [
    key,
    sensitiveNameParts.some((part) => key.toLowerCase().includes(part))
      ? '[Filtered]'
      : entry,
  ])) as Record<string, string>;
}

function contextValue<T extends object>(
  contexts: Record<string, unknown>,
  key: string,
  allowedKeys: readonly string[],
  Type: new () => T,
): T | undefined {
  if (contexts[key] === undefined) return undefined;
  return Object.assign(new Type(), rawObject(contexts[key], `contexts.${key}`, allowedKeys));
}

@Injectable()
export class IngestEnvelopePipe implements PipeTransform<
  unknown,
  IngestEnvelopeDto
> {
  transform(value: unknown): IngestEnvelopeDto {
    // Validate raw keys and keep raw scalar types. class-transformer must not
    // coerce attacker-controlled objects or silently remove JSON properties.
    const root = rawObject(value, 'envelope');
    rawObject(
      root,
      'envelope',
      root.type === 'client_report'
        ? ['version', 'type', 'sentAt', 'sdk', 'environment', 'propagationTargets']
        : ['version', 'type', 'sentAt', 'event'],
    );
    const envelope = Object.assign(new IngestEnvelopeDto(), root);
    if (root.type === 'client_report' && root.propagationTargets !== undefined) envelope.propagationTargets = propagationTargets(root.propagationTargets);
    if (root.event !== undefined) {
      const event = rawObject(root.event, 'event', [
        'eventId',
        'timestamp',
        'type',
        'level',
        'source',
        'message',
        'exception',
        'url',
        'environment',
        'tags',
        'contexts',
      ]);
      envelope.event = Object.assign(new MonitoringErrorEventDto(), event);
      if (event.exception !== undefined) {
        envelope.event.exception = Object.assign(
          new ErrorExceptionDto(),
          rawObject(event.exception, 'exception', [
            'type',
            'value',
            'stacktrace',
          ]),
        );
      }
      if (event.tags !== undefined) {
        safeMap(event.tags, 'tags');
      }
      if (event.contexts !== undefined) {
        const contexts = rawObject(event.contexts, 'contexts', [
          'request', 'browser', 'os', 'device', 'culture', 'memory',
        ]);
        const dto = Object.assign(new BrowserEventContextsDto(), contexts);
        if (contexts.request !== undefined) {
          const request = rawObject(contexts.request, 'contexts.request', ['headers', 'cookies']);
          dto.request = Object.assign(new RequestContextDto(), request);
          if (request.headers !== undefined) dto.request.headers = sanitizeContextMap(request.headers, 'contexts.request.headers');
          if (request.cookies !== undefined) dto.request.cookies = sanitizeContextMap(request.cookies, 'contexts.request.cookies');
        }
        dto.browser = contextValue(contexts, 'browser', ['name', 'version', 'userAgent'], BrowserContextDto);
        dto.os = contextValue(contexts, 'os', ['name'], OperatingSystemContextDto);
        dto.device = contextValue(contexts, 'device', [
          'platform', 'screenWidth', 'screenHeight', 'viewportWidth', 'viewportHeight', 'pixelRatio',
        ], DeviceContextDto);
        dto.culture = contextValue(contexts, 'culture', ['locale', 'languages', 'timezone'], CultureContextDto);
        dto.memory = contextValue(contexts, 'memory', [
          'usedJSHeapSize', 'totalJSHeapSize', 'jsHeapSizeLimit', 'deviceMemoryGiB',
        ], MemoryContextDto);
        envelope.event.contexts = dto;
      }
    }
    if (root.sdk !== undefined) {
      envelope.sdk = Object.assign(
        new SdkMetadataDto(),
        rawObject(root.sdk, 'sdk', ['name', 'version']),
      );
    }
    if (
      validateSync(envelope, {
        whitelist: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
        validationError: { target: false, value: false },
      }).length > 0
    ) {
      throw new BadRequestException('采集 Envelope 格式不合法');
    }
    return envelope;
  }
}

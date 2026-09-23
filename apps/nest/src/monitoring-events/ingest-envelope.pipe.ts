import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { validateSync } from 'class-validator';
import {
  ErrorExceptionDto,
  IngestEnvelopeDto,
  MonitoringErrorEventDto,
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
        ? ['version', 'type', 'sentAt', 'sdk', 'environment', 'release']
        : ['version', 'type', 'sentAt', 'event'],
    );
    const envelope = Object.assign(new IngestEnvelopeDto(), root);
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
        'release',
        'tags',
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
        const tags = rawObject(event.tags, 'tags');
        if (
          Object.keys(tags).some((key) =>
            ['__proto__', 'prototype', 'constructor'].includes(key),
          )
        ) {
          throw new BadRequestException('tags contains a reserved key');
        }
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

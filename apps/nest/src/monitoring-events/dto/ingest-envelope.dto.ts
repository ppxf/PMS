import { Type } from 'class-transformer';
import {
  Equals,
  IsByteLength,
  IsDefined,
  IsIn,
  IsISO8601,
  IsObject,
  IsString,
  IsUUID,
  MaxLength,
  Validate,
  ValidateIf,
  ValidateNested,
  ValidatorConstraint,
} from 'class-validator';
import type {
  ValidationArguments,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'envelopeField', async: false })
class EnvelopeFieldConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    return (args.object as IngestEnvelopeDto).type === args.constraints[0];
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} is not allowed for this envelope type`;
  }
}

@ValidatorConstraint({ name: 'boundedTags', async: false })
class BoundedTagsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return false;
    const entries = Object.entries(value);
    return (
      entries.length <= 50 &&
      entries.every(
        ([key, entry]: [string, unknown]) =>
          [...key].length <= 64 &&
          typeof entry === 'string' &&
          [...entry].length <= 256,
      )
    );
  }

  defaultMessage(): string {
    return 'tags must contain at most 50 string entries with keys up to 64 and values up to 256 characters';
  }
}

@ValidatorConstraint({ name: 'rfc3339Timestamp', async: false })
class Rfc3339TimestampConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u.test(
        value,
      ) &&
      Number.isFinite(Date.parse(value))
    );
  }

  defaultMessage(): string {
    return 'timestamp must be a valid RFC3339 date-time with an explicit timezone';
  }
}

export class SdkMetadataDto {
  @IsString()
  name!: string;

  @IsString()
  version!: string;
}

export class ErrorExceptionDto {
  @IsString()
  @MaxLength(128)
  type!: string;

  @IsString()
  @MaxLength(2000)
  value!: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsByteLength(0, 65536)
  stacktrace?: string;
}

export class MonitoringErrorEventDto {
  @IsUUID()
  eventId!: string;

  @Validate(Rfc3339TimestampConstraint)
  @IsISO8601({ strict: true })
  timestamp!: string;

  @Equals('error')
  type!: 'error';

  @Equals('error')
  level!: 'error';

  @IsIn(['vue', 'window', 'unhandledrejection', 'manual'])
  @MaxLength(128)
  source!: 'vue' | 'window' | 'unhandledrejection' | 'manual';

  @IsString()
  @MaxLength(2000)
  message!: string;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => ErrorExceptionDto)
  exception!: ErrorExceptionDto;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(2048)
  url?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(128)
  environment?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(128)
  release?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Validate(BoundedTagsConstraint)
  tags?: Record<string, string>;
}

export class IngestEnvelopeDto {
  @Equals(1)
  version!: 1;

  @IsIn(['event', 'client_report'])
  type!: 'event' | 'client_report';

  @Validate(Rfc3339TimestampConstraint)
  @IsISO8601({ strict: true })
  sentAt!: string;

  @ValidateIf(
    (object: IngestEnvelopeDto, value: unknown) =>
      object.type === 'event' || value !== undefined,
  )
  @Validate(EnvelopeFieldConstraint, ['event'])
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => MonitoringErrorEventDto)
  event?: MonitoringErrorEventDto;

  @ValidateIf(
    (object: IngestEnvelopeDto, value: unknown) =>
      object.type === 'client_report' || value !== undefined,
  )
  @Validate(EnvelopeFieldConstraint, ['client_report'])
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => SdkMetadataDto)
  sdk?: SdkMetadataDto;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Validate(EnvelopeFieldConstraint, ['client_report'])
  @IsString()
  @MaxLength(128)
  environment?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Validate(EnvelopeFieldConstraint, ['client_report'])
  @IsString()
  @MaxLength(128)
  release?: string;
}

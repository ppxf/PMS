import { Type } from 'class-transformer';
import {
  Equals,
  ArrayMaxSize,
  IsArray,
  IsByteLength,
  IsDefined,
  IsIn,
  IsISO8601,
  IsObject,
  IsNumber,
  IsString,
  IsUUID,
  MaxLength,
  Min,
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

@ValidatorConstraint({ name: 'boundedContextMap', async: false })
export class BoundedContextMapConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const entries = Object.entries(value);
    return entries.length <= 50 && entries.every(([key, entry]) =>
      [...key].length <= 128 && typeof entry === 'string' && [...entry].length <= 2048,
    );
  }

  defaultMessage(): string {
    return 'context map must contain at most 50 string entries with keys up to 128 and values up to 2048 characters';
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

export class RequestContextDto {
  @IsObject()
  @Validate(BoundedContextMapConstraint)
  headers!: Record<string, string>;

  @IsObject()
  @Validate(BoundedContextMapConstraint)
  cookies!: Record<string, string>;
}

export class BrowserContextDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(128)
  name?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(128)
  version?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(1024)
  userAgent?: string;
}

export class OperatingSystemContextDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(128)
  name?: string;
}

export class DeviceContextDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(128)
  platform?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  screenWidth?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  screenHeight?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  viewportWidth?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  viewportHeight?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  pixelRatio?: number;
}

export class CultureContextDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(64)
  locale?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  languages?: string[];

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(128)
  timezone?: string;
}

export class MemoryContextDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  usedJSHeapSize?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  totalJSHeapSize?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  jsHeapSizeLimit?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  deviceMemoryGiB?: number;
}

export class BrowserEventContextsDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => RequestContextDto)
  request?: RequestContextDto;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => BrowserContextDto)
  browser?: BrowserContextDto;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => OperatingSystemContextDto)
  os?: OperatingSystemContextDto;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => DeviceContextDto)
  device?: DeviceContextDto;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => CultureContextDto)
  culture?: CultureContextDto;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => MemoryContextDto)
  memory?: MemoryContextDto;
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
  @Validate(BoundedTagsConstraint)
  tags?: Record<string, string>;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => BrowserEventContextsDto)
  contexts?: BrowserEventContextsDto;
}

export class IngestEnvelopeDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Validate(EnvelopeFieldConstraint, ['client_report'])
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(512, { each: true })
  propagationTargets?: string[];

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

}

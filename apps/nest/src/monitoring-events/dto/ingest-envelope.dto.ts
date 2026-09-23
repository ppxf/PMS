import { Transform, Type } from 'class-transformer';
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

// Preserve JSON scalar types even though the application's global pipe enables
// implicit conversion for other API DTOs.
function JsonValue(): PropertyDecorator {
  return Transform(({ obj, key }) => (obj as Record<string, unknown>)[key], {
    toClassOnly: true,
  });
}

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

export class SdkMetadataDto {
  @JsonValue()
  @IsString()
  name!: string;

  @JsonValue()
  @IsString()
  version!: string;
}

export class ErrorExceptionDto {
  @JsonValue()
  @IsString()
  @MaxLength(128)
  type!: string;

  @JsonValue()
  @IsString()
  @MaxLength(2000)
  value!: string;

  @JsonValue()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsByteLength(0, 65536)
  stacktrace?: string;
}

export class MonitoringErrorEventDto {
  @JsonValue()
  @IsUUID()
  eventId!: string;

  @JsonValue()
  @IsISO8601({ strict: true })
  timestamp!: string;

  @JsonValue()
  @Equals('error')
  type!: 'error';

  @JsonValue()
  @Equals('error')
  level!: 'error';

  @JsonValue()
  @IsIn(['vue', 'window', 'unhandledrejection', 'manual'])
  @MaxLength(128)
  source!: 'vue' | 'window' | 'unhandledrejection' | 'manual';

  @JsonValue()
  @IsString()
  @MaxLength(2000)
  message!: string;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => ErrorExceptionDto)
  exception!: ErrorExceptionDto;

  @JsonValue()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(2048)
  url?: string;

  @JsonValue()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(128)
  environment?: string;

  @JsonValue()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(128)
  release?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Validate(BoundedTagsConstraint)
  tags?: Record<string, string>;
}

export class IngestEnvelopeDto {
  @JsonValue()
  @Equals(1)
  version!: 1;

  @JsonValue()
  @IsIn(['event', 'client_report'])
  type!: 'event' | 'client_report';

  @JsonValue()
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

  @JsonValue()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Validate(EnvelopeFieldConstraint, ['client_report'])
  @IsString()
  @MaxLength(128)
  environment?: string;

  @JsonValue()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Validate(EnvelopeFieldConstraint, ['client_report'])
  @IsString()
  @MaxLength(128)
  release?: string;
}

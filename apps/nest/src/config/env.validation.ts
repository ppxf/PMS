import {
  IsIn,
  IsOptional,
  IsPort,
  IsString,
  IsUrl,
  Matches,
  MinLength,
  validateSync,
} from 'class-validator';
import { plainToInstance } from 'class-transformer';

class EnvironmentVariables {
  @IsOptional()
  @IsIn(['development', 'test', 'production'])
  NODE_ENV?: string;

  @IsOptional()
  @IsPort()
  PORT?: string;

  @IsOptional()
  @IsString()
  APP_NAME?: string;

  @IsOptional()
  @IsString()
  API_PREFIX?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  APP_FRONTEND_URL?: string;

  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  DB_ENABLED?: string;

  @IsOptional()
  @IsString()
  DB_HOST?: string;

  @IsOptional()
  @IsPort()
  DB_PORT?: string;

  @IsOptional()
  @IsString()
  DB_USERNAME?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  DB_PASSWORD?: string;

  @IsOptional()
  @IsString()
  DB_NAME?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  DB_SYNCHRONIZE?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  DB_LOGGING?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  SWAGGER_ENABLED?: string;

  @IsOptional()
  @IsString()
  SWAGGER_PATH?: string;

  @IsOptional()
  @IsString()
  JWT_SECRET?: string;

  @IsOptional()
  @Matches(/^\d+[smhd]$/)
  JWT_EXPIRES_IN?: string;

  @IsOptional()
  @Matches(/^[1-9]\d*$/)
  EMAIL_VERIFICATION_EXPIRES_IN_MINUTES?: string;

  @IsOptional()
  @Matches(/^[1-9]\d*$/)
  PASSWORD_RESET_EXPIRES_IN_MINUTES?: string;

  @IsOptional()
  @IsString()
  SMTP_HOST?: string;

  @IsOptional()
  @IsPort()
  SMTP_PORT?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  SMTP_SECURE?: string;

  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SMTP_PASSWORD?: string;

  @IsOptional()
  @IsString()
  SMTP_FROM?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  MONITORING_PUBLIC_URL?: string;
}

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const validated = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.toString()}`);
  }

  if (validated.NODE_ENV === 'production') {
    if (!validated.JWT_SECRET || validated.JWT_SECRET.length < 32) {
      throw new Error(
        'Environment validation failed: JWT_SECRET must contain at least 32 characters in production',
      );
    }

    const requiredMailSettings = [
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_SECURE',
      'SMTP_USER',
      'SMTP_PASSWORD',
      'SMTP_FROM',
      'APP_FRONTEND_URL',
      'CORS_ORIGINS',
      'MONITORING_PUBLIC_URL',
    ] as const;
    for (const setting of requiredMailSettings) {
      if (!config[setting]) {
        throw new Error(
          `Environment validation failed: ${setting} is required in production`,
        );
      }
    }

    if (
      validated.CORS_ORIGINS?.split(',').some((origin) => origin.trim() === '*')
    ) {
      throw new Error(
        'Environment validation failed: CORS_ORIGINS must not contain a wildcard in production',
      );
    }

    if (!validated.MONITORING_PUBLIC_URL?.startsWith('https://')) {
      throw new Error(
        'Environment validation failed: MONITORING_PUBLIC_URL must use HTTPS in production',
      );
    }
  }

  return config;
}

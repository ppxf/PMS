import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateMonitoringProjectDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsIn(['vue'])
  platform!: 'vue';

  @IsOptional()
  @IsBoolean()
  errorMonitoringEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  loggingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  tracingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  metricsEnabled?: boolean;
}

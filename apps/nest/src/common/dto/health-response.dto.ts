import { ApiProperty } from '@nestjs/swagger';

export class HealthDataDto {
  @ApiProperty({ example: 'PMS API' })
  name!: string;

  @ApiProperty({ example: 'ok' })
  status!: string;

  @ApiProperty({ example: '2026-08-16T08:00:00.000Z' })
  timestamp!: string;
}

export class HealthResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: HealthDataDto })
  data!: HealthDataDto;

  @ApiProperty({ example: '2026-08-16T08:00:00.000Z' })
  timestamp!: string;
}

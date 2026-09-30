import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ListIssuesQueryDto {
  @Transform(({ value }) => (value === undefined ? 1 : Number(value)))
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value }) => (value === undefined ? 20 : Number(value)))
  @IsInt()
  @IsIn([10, 20, 50, 100])
  pageSize = 20;

  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined,
  )
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @Transform(({ value }) => value ?? 'active')
  @IsIn(['active', 'archived'])
  view: 'active' | 'archived' = 'active';
}

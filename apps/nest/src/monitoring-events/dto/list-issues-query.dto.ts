import { Transform } from 'class-transformer';
import { IsIn, IsInt, Min } from 'class-validator';

export class ListIssuesQueryDto {
  @Transform(({ value }) => (value === undefined ? 1 : Number(value)))
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value }) => (value === undefined ? 20 : Number(value)))
  @IsInt()
  @IsIn([10, 20, 50, 100])
  pageSize = 20;
}

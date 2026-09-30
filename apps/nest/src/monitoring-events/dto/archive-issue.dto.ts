import {
  IsIn,
  Validate,
  ValidatorConstraint,
} from 'class-validator';
import type {
  ValidationArguments,
  ValidatorConstraintInterface,
} from 'class-validator';

export type ArchiveIssueMode = 'permanent' | 'until_count';
export type ArchiveIssueThreshold = 10 | 100 | 1000;

@ValidatorConstraint({ name: 'archiveThreshold', async: false })
class ArchiveThresholdConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const input = args.object as ArchiveIssueDto;
    if (input.mode === 'permanent') return value === undefined;
    return value === 10 || value === 100 || value === 1000;
  }

  defaultMessage(): string {
    return 'threshold must be absent for permanent mode or one of 10, 100, 1000 for until_count mode';
  }
}

export class ArchiveIssueDto {
  @IsIn(['permanent', 'until_count'])
  mode!: ArchiveIssueMode;

  @Validate(ArchiveThresholdConstraint)
  threshold?: ArchiveIssueThreshold;
}

import { BadRequestException, PipeTransform } from '@nestjs/common';
import { normalizeSdkOrigin } from '../../common/http/sdk-origin';

export function allowedOrigins(input: unknown): string[] {
  if (!Array.isArray(input) || input.length > 20)
    throw new BadRequestException('At most 20 frontend origins');
  if (input.includes('*')) {
    if (input.length !== 1)
      throw new BadRequestException('Wildcard origin must be used alone');
    return ['*'];
  }
  return [...new Set(input.map((value: unknown) => normalizeSdkOrigin(value)))];
}
export class UpdateOriginsPipe implements PipeTransform<
  unknown,
  { allowedOrigins: string[] }
> {
  transform(input: unknown): { allowedOrigins: string[] } {
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).length !== 1 ||
      !Object.hasOwn(input, 'allowedOrigins')
    )
      throw new BadRequestException('Invalid origins settings');
    return {
      allowedOrigins: allowedOrigins(
        (input as { allowedOrigins: unknown }).allowedOrigins,
      ),
    };
  }
}

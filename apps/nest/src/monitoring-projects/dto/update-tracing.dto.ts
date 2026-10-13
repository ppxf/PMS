import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { jsonObject } from '../../traces/traces-validation';

@Injectable()
export class UpdateTracingPipe implements PipeTransform<
  unknown,
  { tracingEnabled: boolean }
> {
  transform(value: unknown): { tracingEnabled: boolean } {
    const input = jsonObject(value, ['tracingEnabled']);
    if (typeof input.tracingEnabled !== 'boolean')
      throw new BadRequestException('tracingEnabled must be boolean');
    return { tracingEnabled: input.tracingEnabled };
  }
}

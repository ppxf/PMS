import { Injectable, PipeTransform } from '@nestjs/common';
import { jsonObject, reject } from '../../traces/traces-validation';
@Injectable()
export class UpdateLoggingPipe implements PipeTransform {
  transform(input: unknown): { loggingEnabled: boolean } {
    const value = jsonObject(input, ['loggingEnabled']);
    if (typeof value.loggingEnabled !== 'boolean')
      reject('loggingEnabled must be boolean');
    return { loggingEnabled: value.loggingEnabled };
  }
}

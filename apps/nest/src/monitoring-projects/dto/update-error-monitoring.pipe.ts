import { Injectable, PipeTransform } from '@nestjs/common';
import { jsonObject, reject } from '../../traces/traces-validation';

@Injectable()
export class UpdateErrorMonitoringPipe implements PipeTransform {
  transform(input: unknown): { errorMonitoringEnabled: boolean } {
    const value = jsonObject(input, ['errorMonitoringEnabled']);
    if (typeof value.errorMonitoringEnabled !== 'boolean')
      reject('errorMonitoringEnabled must be boolean');
    return { errorMonitoringEnabled: value.errorMonitoringEnabled };
  }
}

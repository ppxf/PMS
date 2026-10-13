import { Injectable, PipeTransform } from '@nestjs/common';
import { jsonObject, reject } from '../../traces/traces-validation';
@Injectable()
export class UpdateMetricsPipe implements PipeTransform {
  transform(input: unknown): { metricsEnabled: boolean } {
    const value = jsonObject(input, ['metricsEnabled']);
    if (typeof value.metricsEnabled !== 'boolean')
      reject('metricsEnabled must be boolean');
    return { metricsEnabled: value.metricsEnabled };
  }
}

import { Injectable, PipeTransform } from '@nestjs/common';
import { IngestEnvelopeDto } from '../monitoring-events/dto/ingest-envelope.dto';
import { IngestEnvelopePipe } from '../monitoring-events/ingest-envelope.pipe';
import { TransactionEnvelope } from './traces-contract';
import { jsonObject, TransactionEnvelopePipe } from './traces-validation';
import { MetricsEnvelope } from '../metrics/metrics-contract';
import { MetricsEnvelopePipe } from '../metrics/metrics-validation';

@Injectable()
export class SdkEnvelopePipe implements PipeTransform<
  unknown,
  IngestEnvelopeDto | TransactionEnvelope | MetricsEnvelope
> {
  transform(
    input: unknown,
  ): IngestEnvelopeDto | TransactionEnvelope | MetricsEnvelope {
    if (jsonObject(input).type === 'metrics')
      return new MetricsEnvelopePipe().transform(input);
    return jsonObject(input).type === 'transaction'
      ? new TransactionEnvelopePipe().transform(input)
      : new IngestEnvelopePipe().transform(input);
  }
}

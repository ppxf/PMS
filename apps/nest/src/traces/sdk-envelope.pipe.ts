import { Injectable, PipeTransform } from '@nestjs/common';
import { IngestEnvelopeDto } from '../monitoring-events/dto/ingest-envelope.dto';
import { IngestEnvelopePipe } from '../monitoring-events/ingest-envelope.pipe';
import { TransactionEnvelope } from './traces-contract';
import { jsonObject, TransactionEnvelopePipe } from './traces-validation';
import { MetricsEnvelope } from '../metrics/metrics-contract';
import { MetricsEnvelopePipe } from '../metrics/metrics-validation';
import type { LogsEnvelope } from '../logs/logs-contract';
import { LogsEnvelopePipe } from '../logs/logs-validation';

@Injectable()
export class SdkEnvelopePipe implements PipeTransform<
  unknown,
  IngestEnvelopeDto | TransactionEnvelope | MetricsEnvelope | LogsEnvelope
> {
  transform(
    input: unknown,
  ): IngestEnvelopeDto | TransactionEnvelope | MetricsEnvelope | LogsEnvelope {
    if (jsonObject(input).type === 'logs')
      return new LogsEnvelopePipe().transform(input);
    if (jsonObject(input).type === 'metrics')
      return new MetricsEnvelopePipe().transform(input);
    return jsonObject(input).type === 'transaction'
      ? new TransactionEnvelopePipe().transform(input)
      : new IngestEnvelopePipe().transform(input);
  }
}

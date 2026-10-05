import { Injectable, PipeTransform } from '@nestjs/common';
import { IngestEnvelopeDto } from '../monitoring-events/dto/ingest-envelope.dto';
import { IngestEnvelopePipe } from '../monitoring-events/ingest-envelope.pipe';
import { TransactionEnvelope } from './traces-contract';
import { jsonObject, TransactionEnvelopePipe } from './traces-validation';

@Injectable()
export class SdkEnvelopePipe implements PipeTransform<
  unknown,
  IngestEnvelopeDto | TransactionEnvelope
> {
  transform(input: unknown): IngestEnvelopeDto | TransactionEnvelope {
    return jsonObject(input).type === 'transaction'
      ? new TransactionEnvelopePipe().transform(input)
      : new IngestEnvelopePipe().transform(input);
  }
}

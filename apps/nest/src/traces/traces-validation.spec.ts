import { TransactionEnvelopePipe, SpanQueryPipe } from './traces-validation';

import { transactionFixture } from './traces-test.fixture';

describe('tracing ingestion boundary', () => {
  const pipe = new TransactionEnvelopePipe();
  it('accepts remote parents and preserves monotonic duration', () => {
    const input = transactionFixture();
    Object.assign(input.transaction.spans[0], {
      parentSpanId: '3'.repeat(16),
      durationMs: 5,
    });
    expect(pipe.transform(input).transaction.spans[0].durationMs).toBe(5);
  });
  it.each([
    { traceId: '0'.repeat(32) },
    { durationMs: '20' },
    { endTime: 'bad' },
    { attributes: { nested: {} } },
    { httpStatusCode: 999 },
    { unknown: 1 },
  ])('rejects invalid spans %j', (patch) => {
    const input = transactionFixture();
    Object.assign(input.transaction.spans[0], patch);
    expect(() => pipe.transform(input)).toThrow();
  });
  it('rejects duplicates and cycles but permits missing parents', () => {
    const input = transactionFixture();
    input.transaction.spans.push({ ...input.transaction.spans[0] });
    expect(() => pipe.transform(input)).toThrow();
    input.transaction.spans[1].spanId = '3'.repeat(16);
    Object.assign(input.transaction.spans[0], { parentSpanId: '3'.repeat(16) });
    Object.assign(input.transaction.spans[1], { parentSpanId: '2'.repeat(16) });
    expect(() => pipe.transform(input)).toThrow();
  });
  it('rejects stale sends', () => {
    const input = transactionFixture();
    input.sentAt = new Date(Date.now() - 25 * 3600000).toISOString();
    expect(() => pipe.transform(input)).toThrow();
  });
});

describe('span query registry validation', () => {
  const input = () => ({
    start: '2026-10-01T00:00:00Z',
    end: '2026-10-02T00:00:00Z',
    filters: [],
    metrics: [{ function: 'p95', field: 'span.duration' }],
    groupBy: ['span.op'],
  });
  it('rejects arbitrary SQL names, unsupported aggregate and grouping', () => {
    const pipe = new SpanQueryPipe();
    expect(() =>
      pipe.transform({ ...input(), groupBy: ['span.duration'] }),
    ).toThrow();
    expect(() =>
      pipe.transform({
        ...input(),
        metrics: [{ function: 'avg', field: 'http.status_code' }],
      }),
    ).toThrow();
    expect(() =>
      pipe.transform({
        ...input(),
        filters: [{ field: 'drop table', operator: 'eq', value: 1 }],
      }),
    ).toThrow();
  });
  it('rejects excessive time ranges and bad scalar filter types', () => {
    const pipe = new SpanQueryPipe();
    expect(() =>
      pipe.transform({ ...input(), end: '2027-01-01T00:00:00Z' }),
    ).toThrow();
    expect(() =>
      pipe.transform({
        ...input(),
        filters: [{ field: 'is_transaction', operator: 'eq', value: 'true' }],
      }),
    ).toThrow();
  });
});

import { TransactionEnvelopePipe, SpanQueryPipe } from './traces-validation';

import {
  browserTransactionFixture,
  transactionFixture,
} from './traces-test.fixture';
import { SPAN_FIELD_MAP } from './traces-contract';

describe('tracing ingestion boundary', () => {
  const pipe = new TransactionEnvelopePipe();
  it('preserves historical resource timings, measurements and zero-duration browser events', () => {
    const input = browserTransactionFixture();
    const spans = pipe.transform(input).transaction.spans;
    expect(spans[1]).toMatchObject({
      parentSpanId: spans[0].spanId,
      traceId: spans[0].traceId,
      isTransaction: false,
      op: 'resource.script',
      name: 'https://app.test/assets/app.js',
      startTime: input.transaction.spans[1].startTime,
      endTime: input.transaction.spans[1].endTime,
      durationMs: 150.25,
      ttfbMs: 30.5,
      transferSize: 1234,
      encodedBodySize: 1000,
      decodedBodySize: 3000,
      attributes: { 'resource.timing_available': true },
    });
    expect(spans[2]).toMatchObject({
      op: 'browser.dom_content_loaded_event',
      durationMs: 0,
      parentSpanId: spans[0].spanId,
    });
    expect(spans[2].startTime).toBe(spans[2].endTime);
  });
  it('allows unavailable cross-origin measurements to remain absent', () => {
    const input = browserTransactionFixture();
    Object.assign(input.transaction.spans[1], {
      ttfbMs: undefined,
      transferSize: undefined,
      encodedBodySize: undefined,
      decodedBodySize: undefined,
      attributes: { 'resource.timing_available': false },
    });
    const resource = pipe.transform(input).transaction.spans[1];
    expect(resource.ttfbMs).toBeUndefined();
    expect(resource.transferSize).toBeUndefined();
    expect(resource.attributes['resource.timing_available']).toBe(false);
  });
  it.each(['ttfbMs', 'transferSize', 'encodedBodySize', 'decodedBodySize'])(
    'rejects invalid resource measurement %s',
    (field) => {
      const input = browserTransactionFixture();
      Object.assign(input.transaction.spans[1], { [field]: -1 });
      expect(() => pipe.transform(input)).toThrow(
        'Invalid nonnegative finite number',
      );
    },
  );
  it('keeps the 200-span and 256 KiB limits for resource-heavy pages', () => {
    const input = transactionFixture();
    const root = input.transaction.spans[0];
    for (let index = 1; index < 200; index++) {
      input.transaction.spans.push(
        Object.assign(
          { ...root },
          {
            spanId: (index + 32).toString(16).padStart(16, '0'),
            parentSpanId: root.spanId,
            isTransaction: false,
            op: 'resource.img',
            name: `/assets/${index}.png`,
          },
        ),
      );
    }
    expect(pipe.transform(input).transaction.spans).toHaveLength(200);
    const oversized = structuredClone(input);
    for (const span of oversized.transaction.spans) {
      span.attributes = Object.fromEntries(
        Array.from({ length: 10 }, (_, index) => [
          `resource.detail_${index}`,
          'x'.repeat(256),
        ]),
      );
    }
    expect(() => pipe.transform(oversized)).toThrow(
      'Transaction exceeds 256 KiB',
    );
    input.transaction.spans.push({ ...root, spanId: 'f'.repeat(16) });
    expect(() => pipe.transform(input)).toThrow(
      'A batch must contain 1 to 200 spans',
    );
  });
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
  it('accepts canonical vitals p75 and scopes projections to the owning pageload span', () => {
    const query = new SpanQueryPipe().transform({
      start: '2026-10-01T00:00:00Z',
      end: '2026-10-02T00:00:00Z',
      filters: [],
      groupBy: [],
      metrics: [{ function: 'p75', field: 'browser.web_vital.cls.value' }],
    });
    expect(query.metrics[0].function).toBe('p75');
    const field = SPAN_FIELD_MAP.get('browser.web_vital.cls.value')!;
    expect(field.unit).toBe('none');
    expect(field.sql).toContain('p.project_id=monitoring_spans.project_id');
    expect(field.sql).toContain(
      "p.dimensions->>'spanId'=monitoring_spans.span_id",
    );
    expect(field.sql).toContain("monitoring_spans.op='pageload'");
    expect(field.sql).toContain('monitoring_spans.is_transaction');
  });
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

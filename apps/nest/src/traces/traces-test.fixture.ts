export const transactionFixture = () => ({
  version: 1,
  type: 'transaction',
  sentAt: new Date().toISOString(),
  transaction: {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    spans: [
      {
        traceId: '1'.repeat(32),
        spanId: '2'.repeat(16),
        isTransaction: true,
        op: 'pageload',
        name: '/home',
        startTime: new Date(Date.now() - 20).toISOString(),
        endTime: new Date().toISOString(),
        durationMs: 20,
        status: 'ok',
        truncated: false,
        endReason: 'completed',
        droppedSpanCount: 0,
        attributes: {},
      },
    ],
  },
});

/** A completed page with historical browser timings, as emitted by the SDK. */
export const browserTransactionFixture = () => {
  const input = transactionFixture();
  const started = Date.now() - 5000;
  const root = input.transaction.spans[0];
  Object.assign(root, {
    startTime: new Date(started).toISOString(),
    endTime: new Date(started + 2000).toISOString(),
    durationMs: 2000,
  });
  input.transaction.spans.push(
    Object.assign(
      { ...root },
      {
        spanId: '3'.repeat(16),
        parentSpanId: root.spanId,
        isTransaction: false,
        op: 'resource.script',
        name: 'https://app.test/assets/app.js',
        startTime: new Date(started + 100).toISOString(),
        endTime: new Date(started + 250).toISOString(),
        durationMs: 150.25,
        ttfbMs: 30.5,
        transferSize: 1234,
        encodedBodySize: 1000,
        decodedBodySize: 3000,
        attributes: {
          'resource.url': 'https://app.test/assets/app.js',
          'resource.initiator_type': 'script',
          'resource.timing_available': true,
        },
      },
    ),
    Object.assign(
      { ...root },
      {
        spanId: '4'.repeat(16),
        parentSpanId: root.spanId,
        isTransaction: false,
        op: 'browser.dom_content_loaded_event',
        name: '/home',
        startTime: new Date(started + 900).toISOString(),
        endTime: new Date(started + 900).toISOString(),
        durationMs: 0,
        attributes: {},
      },
    ),
  );
  return input;
};

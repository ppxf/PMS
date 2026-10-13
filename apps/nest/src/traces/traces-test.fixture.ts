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

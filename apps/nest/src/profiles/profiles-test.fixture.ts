export const profileEnvelope = () => ({
  version: 1 as const,
  type: 'profile' as const,
  sentAt: new Date().toISOString(),
  profile: {
    profileId: '550e8400-e29b-41d4-a716-446655440001',
    startedAt: new Date(Date.now() - 1000).toISOString(),
    durationMs: 30,
    sampleIntervalMs: 10,
    name: 'Checkout',
    environment: 'production',
    traceId: 'a'.repeat(32),
    spanId: 'b'.repeat(16),
    truncated: false,
    resources: ['https://example.test/app.js'],
    frames: [{ name: 'root', resourceId: 0 }, { name: 'child' }],
    stacks: [{ frameId: 0 }, { frameId: 1, parentId: 0 }],
    samples: [
      { timestamp: 0, stackId: 0 },
      { timestamp: 10, stackId: 1 },
      { timestamp: 20 },
    ],
  },
});
export const profileQuery = () => ({
  start: new Date(Date.now() - 60000).toISOString(),
  end: new Date().toISOString(),
});

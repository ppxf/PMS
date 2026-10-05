import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMonitoringClient } from './client.js'
import { TransportError } from './http-transport.js'
import type { MonitoringEnvelope } from './types.js'
const dsn = 'https://key@monitor.example.com/api/sdk/project'
afterEach(() => vi.useRealTimers())
describe('application metrics', () => {
  it('batches independent metrics without trace sampling and snapshots attributes', async () => {
    vi.useFakeTimers()
    const envelopes: MonitoringEnvelope[] = []
    const client = createMonitoringClient()
    client.init({ dsn, enableMetrics: true, tracesSampleRate: 0, environment: 'prod', transport: { send: e => { envelopes.push(e); return Promise.resolve() } } })
    const attributes = { route: '/checkout' }
    client.metrics.count('checkout.completed', 3, { attributes })
    attributes.route = '/changed'
    client.metrics.gauge('queue.depth', -2)
    client.metrics.distribution('checkout.duration', 125, { unit: 'millisecond' })
    expect(envelopes.filter(e => e.type === 'metrics')).toHaveLength(0)
    await client.flush()
    const batch = envelopes.find(e => e.type === 'metrics')!
    expect(batch).toMatchObject({ type: 'metrics', samples: [
      { type: 'count', value: 3, attributes: { route: '/checkout' }, environment: 'prod' },
      { type: 'gauge', value: -2 }, { type: 'distribution', unit: 'millisecond' },
    ] })
    expect(client.getMetricStats().queuedBatches).toBe(0)
    client.resetClientForTests()
  })
  it('retries transient errors with the same batch identity, drops permanent errors', async () => {
    vi.useFakeTimers()
    const send = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new TransportError('busy', { status: 429 })).mockResolvedValueOnce(undefined)
    const client = createMonitoringClient()
    client.init({ dsn, enableMetrics: true, transport: { send } })
    client.metrics.count('orders')
    await client.flush()
    const batch = send.mock.calls[1][0]
    await vi.advanceTimersByTimeAsync(1000)
    expect(send.mock.calls[2][0]).toBe(batch)
    send.mockRejectedValueOnce(new TransportError('disabled', { status: 403 }))
    client.metrics.count('orders'); await client.flush()
    expect(client.getMetricStats()).toMatchObject({ droppedSamples: 1, queuedBatches: 0 })
    client.resetClientForTests()
  })
  it('bounds queue, rejects invalid values and keeps clients isolated', () => {
    vi.useFakeTimers()
    const client = createMonitoringClient(), other = createMonitoringClient()
    client.init({ dsn, enableMetrics: true, transport: { send: () => new Promise(() => {}) } })
    other.init({ dsn, transport: { send: () => Promise.resolve() } })
    other.metrics.count('orders')
    expect(other.getMetricStats().bufferedSamples).toBe(0)
    client.metrics.count('orders', -1); client.metrics.gauge('orders', NaN)
    for (let i = 0; i < 1100; i++) client.metrics.count('orders')
    expect(client.getMetricStats()).toMatchObject({ droppedSamples: 102, queuedBatches: 10 })
    expect(() => client.init({ dsn, enableMetrics: false })).toThrow('different options')
    client.resetClientForTests(); other.resetClientForTests()
  })
  it('flushes automatically and retains explicit trace context', async () => {
    vi.useFakeTimers()
    const send = vi.fn().mockResolvedValue(undefined)
    const client = createMonitoringClient()
    client.init({ dsn, enableMetrics: true, transport: { send } })
    const span = client.startInactiveSpan({ name: 'checkout' })
    client.metrics.count('orders', 1, { traceContext: span.context })
    await vi.advanceTimersByTimeAsync(5000)
    expect(send.mock.calls[1][0].samples[0]).toMatchObject({ traceId: span.context.traceId, spanId: span.context.spanId })
    client.resetClientForTests()
  })
})

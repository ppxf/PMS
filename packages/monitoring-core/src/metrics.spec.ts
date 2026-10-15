import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMonitoringClient } from './client.js'
import { TransportError } from './http-transport.js'
import { createBrowserTracing } from './browser-tracing.js'
import type { MonitoringEnvelope } from './types.js'
const dsn = 'https://key@monitor.example.com/api/sdk/project'
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('application metrics', () => {
  it('automatically correlates metrics after page idle and await, and clears on page hide', async () => {
    vi.useFakeTimers()
    const envelopes: MonitoringEnvelope[] = []
    const client = createMonitoringClient()
    client.init({ dsn, enableMetrics: true, tracesSampleRate: 1, transport: { send: e => { envelopes.push(e); return Promise.resolve() } } })
    const browser = createBrowserTracing(client)
    const page = browser.startNavigation('/cart')
    browser.navigationReady()
    await vi.advanceTimersByTimeAsync(2500)
    expect(page.ended).toBe(true)
    client.metrics.count('click')
    await Promise.resolve()
    client.metrics.distribution('duration', 200)
    const next = browser.startNavigation('/next')
    client.metrics.count('next')
    browser.endNavigation('page_hidden')
    client.metrics.count('hidden')
    await client.flush()
    const samples = envelopes.filter(e => e.type === 'metrics').flatMap(e => e.samples)
    expect(samples[0]).toMatchObject({ traceId: page.context.traceId, spanId: page.context.spanId })
    expect(samples[1]).toMatchObject({ traceId: page.context.traceId, spanId: page.context.spanId })
    expect(samples[2]).toMatchObject({ traceId: next.context.traceId, spanId: next.context.spanId })
    expect(next.context.traceId).not.toBe(page.context.traceId)
    expect(samples[3].traceId).toBeUndefined()
    client.resetClientForTests()
  })
  it('adds SDK and browser grouping attributes without replacing custom metric identities', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Chrome/154.0.1 Safari/537.36' })
    const envelopes: MonitoringEnvelope[] = []
    const client = createMonitoringClient()
    client.init({ dsn, enableMetrics: true, sdk: { name: '@pms/test', version: '2.0.0' }, transport: { send: e => { envelopes.push(e); return Promise.resolve() } } })
    client.metrics.gauge('inventory.stock', 150, { attributes: { warehouse: 'east', 'sdk.name': 'spoofed' } })
    await client.flush()
    expect(envelopes.find(e => e.type === 'metrics')!.samples[0]).toMatchObject({
      name: 'inventory.stock', type: 'gauge', value: 150,
      attributes: { warehouse: 'east', 'sdk.name': '@pms/test', 'sdk.version': '2.0.0', 'browser.name': 'Chrome', 'browser.version': '154.0.1', 'user_agent.original': 'Mozilla/5.0 Chrome/154.0.1 Safari/537.36' },
    })
    client.resetClientForTests()
  })
  it('falls back to the live page when the callback span has already ended', async () => {
    vi.useFakeTimers()
    const envelopes: MonitoringEnvelope[] = []
    const client = createMonitoringClient()
    client.init({ dsn, enableMetrics: true, tracesSampleRate: 1, transport: { send: e => { envelopes.push(e); return Promise.resolve() } } })
    const browser = createBrowserTracing(client), page = browser.startNavigation('/page')
    client.startSpan({ name: 'finished' }, span => { span.end(); client.metrics.count('after_end') })
    browser.endNavigation()
    await client.flush()
    expect(envelopes.find(e => e.type === 'metrics')!.samples[0]).toMatchObject({ traceId: page.context.traceId, spanId: page.context.spanId })
    client.resetClientForTests()
  })
  it('does not automatically link a metric to a span dropped by the recording limit', async () => {
    vi.useFakeTimers()
    const envelopes: MonitoringEnvelope[] = []
    const client = createMonitoringClient()
    client.init({ dsn, enableMetrics: true, tracesSampleRate: 1, transport: { send: e => { envelopes.push(e); return Promise.resolve() } } })
    const root = client.startInactiveSpan({ name: 'root' })
    for (let index = 0; index < 199; index++) client.startSpan({ name: 'child', parent: root }, () => undefined)
    client.startSpan({ name: 'dropped', parent: root }, () => client.metrics.count('dropped'))
    root.end()
    await client.flush()
    expect(envelopes.find(e => e.type === 'metrics')!.samples[0].traceId).toBeUndefined()
    client.resetClientForTests()
  })
  it('inherits the current callback span, restores nested scopes and honors explicit context', async () => {
    vi.useFakeTimers()
    const envelopes: MonitoringEnvelope[] = []
    const client = createMonitoringClient()
    client.init({ dsn, enableMetrics: true, tracesSampleRate: 1, transport: { send: e => { envelopes.push(e); return Promise.resolve() } } })
    const explicit = client.startInactiveSpan({ name: 'explicit' })
    let outerId = '', innerId = '', traceId = ''
    client.startSpan({ name: 'outer' }, outer => {
      outerId = outer.context.spanId; traceId = outer.context.traceId
      client.metrics.count('outer')
      client.startSpan({ name: 'inner' }, inner => {
        innerId = inner.context.spanId
        client.metrics.count('inner')
        client.metrics.count('override', 1, { traceContext: explicit.context })
      })
      client.metrics.count('restored')
    })
    client.metrics.count('outside')
    explicit.end()
    await client.flush()
    const batch = envelopes.find(e => e.type === 'metrics')!
    expect(batch.samples).toMatchObject([
      { name: 'outer', traceId, spanId: outerId },
      { name: 'inner', traceId, spanId: innerId },
      { name: 'override', traceId: explicit.context.traceId, spanId: explicit.context.spanId },
      { name: 'restored', traceId, spanId: outerId },
      { name: 'outside' },
    ])
    expect(batch.samples[4].traceId).toBeUndefined()
    client.resetClientForTests()
  })
  it('binds to live navigation, clears ended roots and keeps independent clients isolated', async () => {
    vi.useFakeTimers()
    const envelopes: MonitoringEnvelope[] = []
    const client = createMonitoringClient(), other = createMonitoringClient()
    for (const c of [client, other]) c.init({ dsn, enableMetrics: true, tracesSampleRate: 1, transport: { send: e => { envelopes.push(e); return Promise.resolve() } } })
    const browser = createBrowserTracing(client)
    const first = browser.startNavigation('/first')
    client.metrics.gauge('first', 150)
    other.metrics.count('isolated')
    const second = browser.startNavigation('/second')
    client.metrics.distribution('second', 200)
    browser.endNavigation()
    client.metrics.count('ended')
    await client.flush(); await other.flush()
    const samples = envelopes.filter(e => e.type === 'metrics').flatMap(e => e.samples)
    expect(samples.find(s => s.name === 'first')).toMatchObject({ traceId: first.context.traceId, spanId: first.context.spanId })
    expect(samples.find(s => s.name === 'second')).toMatchObject({ traceId: second.context.traceId, spanId: second.context.spanId })
    expect(samples.find(s => s.name === 'ended')?.traceId).toBeUndefined()
    expect(samples.find(s => s.name === 'isolated')?.traceId).toBeUndefined()
    client.resetClientForTests(); other.resetClientForTests()
  })
  it('does not leak asynchronous or throwing callback contexts or link automatically to unsampled spans', async () => {
    vi.useFakeTimers()
    const envelopes: MonitoringEnvelope[] = []
    const client = createMonitoringClient()
    client.init({ dsn, enableMetrics: true, tracesSampleRate: 1, transport: { send: e => { envelopes.push(e); return Promise.resolve() } } })
    const pending = client.startSpan({ name: 'async' }, async span => {
      client.metrics.count('before')
      await Promise.resolve()
      client.metrics.count('after', 1, { traceContext: span.context })
    })
    client.metrics.count('concurrent')
    await pending
    expect(() => client.startSpan({ name: 'throwing' }, () => { throw new Error('business') })).toThrow('business')
    client.metrics.count('after_error')
    client.startSpan({ name: 'unsampled', parent: { traceId: '1'.repeat(32), spanId: '2'.repeat(16), sampled: false } }, () => client.metrics.count('unsampled'))
    await client.flush()
    const batch = envelopes.find(e => e.type === 'metrics')!
    expect(batch.samples[0].traceId).toBeDefined()
    expect(batch.samples[1].traceId).toBeUndefined()
    expect(batch.samples[2].traceId).toBe(batch.samples[0].traceId)
    expect(batch.samples[3].traceId).toBeUndefined()
    expect(batch.samples[4].traceId).toBeUndefined()
    client.resetClientForTests()
  })
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

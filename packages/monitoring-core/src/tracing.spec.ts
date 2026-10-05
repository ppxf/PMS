import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMonitoringClient } from './client.js'
import type { MonitoringEnvelope, Transport } from './types.js'

const dsn = 'https://key@monitor.test/api/sdk/project'
afterEach(() => vi.useRealTimers())

function fixture(rate = 1) {
  const envelopes: MonitoringEnvelope[] = []
  const client = createMonitoringClient()
  client.init({ dsn, tracesSampleRate: rate, transport: { send: (e) => { envelopes.push(e); return Promise.resolve() } } })
  return { client, envelopes }
}

describe('instance tracing', () => {
  it('returns business objects unchanged even when observing then throws', async () => {
    const { client } = fixture()
    const value = Object.defineProperty({}, 'then', { get() { throw new Error('getter') } })
    expect(client.startSpan({ name: 'object' }, () => value)).toBe(value)
    await client.flush()
  })
  it('retains the root and records span loss when the batch limit is reached', async () => {
    const { client, envelopes } = fixture()
    const root = client.startInactiveSpan({ name: 'limited' })
    for (let index = 0; index < 205; index++) client.startSpan({ name: `child-${index}`, parent: root }, () => undefined)
    root.end()
    await client.flush()
    const batch = envelopes.find((e) => e.type === 'transaction')!
    expect(batch.transaction.spans).toHaveLength(200)
    expect(batch.transaction.spans[0]).toMatchObject({ name: 'limited', truncated: true, droppedSpanCount: 6 })
  })
  it('preserves sync values and business exceptions while recording root and children', async () => {
    const { client, envelopes } = fixture()
    expect(client.startSpan({ name: 'root', op: 'business' }, (root) =>
      client.startSpan({ name: 'child', op: 'business', parent: root }, () => 42))).toBe(42)
    const failure = new Error('business failure')
    expect(() => client.startSpan({ name: 'failed' }, () => { throw failure })).toThrow(failure)
    await client.flush()
    const batches = envelopes.filter((e) => e.type === 'transaction')
    expect(batches).toHaveLength(2)
    expect(batches[0]?.transaction.spans).toHaveLength(2)
    const [root, child] = batches[0].transaction.spans
    expect(root.isTransaction).toBe(true)
    expect(child.parentSpanId).toBe(root.spanId)
    expect(child.traceId).toBe(root.traceId)
    expect(batches[1]?.transaction.spans[0]?.status).toBe('error')
  })

  it('preserves the original promise and records rejected async operations', async () => {
    const { client, envelopes } = fixture()
    const failure = new Error('async failure')
    const promise = Promise.reject(failure)
    expect(client.startSpan({ name: 'async' }, () => promise)).toBe(promise)
    await expect(promise).rejects.toBe(failure)
    await client.flush()
    expect(envelopes.filter((e) => e.type === 'transaction')[0]?.transaction.spans[0]?.status).toBe('error')
  })

  it('inherits a remote sampling decision and isolates parallel parents', async () => {
    const { client, envelopes } = fixture(0)
    const context = { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), sampled: true }
    const root = client.startInactiveSpan({ name: 'remote', parent: context })
    const child = client.startInactiveSpan({ name: 'child', parent: root })
    child.end()
    root.end()
    await client.flush()
    const batch = envelopes.find((e) => e.type === 'transaction')
    expect(batch?.transaction.spans[0]).toMatchObject({ traceId: context.traceId, parentSpanId: context.spanId, isTransaction: true })
    const off = fixture(0)
    off.client.startSpan({ name: 'unsampled' }, () => 1)
    await off.client.flush()
    expect(off.envelopes.some((e) => e.type === 'transaction')).toBe(false)
  })

  it('seals truncated children without cancelling business work and rejects late changes', async () => {
    const { client, envelopes } = fixture()
    const root = client.startInactiveSpan({ name: 'page' })
    const child = client.startInactiveSpan({ name: 'pending', parent: root })
    root.end('unknown', 'page_hidden')
    await client.flush()
    child.end('ok')
    const batch = envelopes.find((e) => e.type === 'transaction')!
    expect(batch.transaction.spans[1]).toMatchObject({ truncated: true, status: 'unknown', endReason: 'page_hidden' })
    expect(Object.isFrozen(batch.transaction.spans[1])).toBe(true)
  })

  it('retries transient failures with the same immutable payload', async () => {
    vi.useFakeTimers()
    const payloads: MonitoringEnvelope[] = []
    const transport: Transport = { send: (e) => {
      if (e.type !== 'transaction') return Promise.resolve()
      payloads.push(e)
      if (payloads.length === 1) return Promise.reject(Object.assign(new Error('busy'), { status: 503 }))
      return Promise.resolve()
    } }
    const client = createMonitoringClient()
    client.init({ dsn, transport, tracesSampleRate: 1 })
    client.startSpan({ name: 'retry' }, () => undefined)
    await client.flush()
    await vi.advanceTimersByTimeAsync(2000)
    expect(payloads).toHaveLength(2)
    expect(payloads[1]).toBe(payloads[0])
  })
  it('retries a transport that throws synchronously instead of caching a completed send', async () => {
    vi.useFakeTimers()
    let attempts = 0
    const client = createMonitoringClient()
    client.init({ dsn, tracesSampleRate: 1, transport: { send(e) {
      if (e.type === 'transaction' && ++attempts === 1) throw new Error('offline')
      return Promise.resolve()
    } } })
    client.startSpan({ name: 'sync-transport' }, () => undefined)
    await client.flush()
    await vi.advanceTimersByTimeAsync(2000)
    expect(attempts).toBe(2)
    expect(client.getTraceStats().queuedBatches).toBe(0)
  })
})

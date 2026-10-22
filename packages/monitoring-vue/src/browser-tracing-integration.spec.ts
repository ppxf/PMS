import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MonitoringEnvelope, Transport } from '@pms/monitoring-core'

const dsn = 'http://browser-key@localhost:3001/api/sdk/browser-project'

class RecordingTransport implements Transport {
  readonly envelopes: MonitoringEnvelope[] = []
  send(envelope: MonitoringEnvelope): Promise<void> {
    this.envelopes.push(envelope)
    return Promise.resolve()
  }
  get events() {
    return this.envelopes.filter((envelope) => envelope.type === 'event')
  }
}

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllGlobals())

describe('browser tracing integration', () => {
  it('reports browser errors and automatic HTTP spans through one Vue client', async () => {
    const { createApp } = await import('vue')
    const sdk = await import('./index.js')
    const target = new EventTarget() as Window
    Object.assign(target, {
      document: Object.assign(new EventTarget(), { readyState: 'complete', visibilityState: 'visible' }),
      location: new URL('https://app.test/orders'),
      performance: { now: () => performance.now(), getEntriesByType: () => [] },
      fetch: () => Promise.resolve(new Response('', { status: 200 })),
    })
    vi.stubGlobal('window', target)
    const transport = new RecordingTransport()
    const options = { app: createApp({}), dsn, transport, tracesSampleRate: 1, integrations: [sdk.browserTracingIntegration()] }
    const state = sdk.init(options)
    expect(sdk.init(options)).toBe(state)
    await target.fetch('/api/orders')
    target.dispatchEvent(Object.assign(new Event('error'), { message: 'script failed' }))
    target.dispatchEvent(new Event('pagehide'))
    await sdk.flush()
    expect(transport.envelopes.filter(e => e.type === 'client_report')).toHaveLength(1)
    expect(transport.events.map(e => e.event.message)).toEqual(['script failed'])
    const spans = transport.envelopes.filter(e => e.type === 'transaction').flatMap(e => e.transaction.spans)
    expect(spans.find(span => span.op === 'http.client')).toMatchObject({ name: 'GET /api/orders', httpStatusCode: 200 })
  })
  it('sets up a plugin on the host client without initializing this package client', async () => {
    const { createMonitoringClient } = await import('@pms/monitoring-core')
    const sdk = await import('./index.js')
    const transport = new RecordingTransport()
    const client = createMonitoringClient()
    client.init({ dsn, transport, tracesSampleRate: 1 })
    expect(transport.envelopes.map(envelope => envelope.type)).toEqual(['client_report'])
    const target = new EventTarget() as Window
    const doc = Object.assign(new EventTarget(), { readyState: 'complete', visibilityState: 'visible' })
    const fetch = vi.fn((url: unknown, init?: RequestInit) => { void url; void init; return Promise.resolve(new Response('', { status: 200 })) })
    Object.assign(target, { document: doc, location: new URL('https://app.test/orders'), performance: { now: () => performance.now(), getEntriesByType: () => [] }, fetch })
    const router = { beforeEach: vi.fn(), afterEach: vi.fn() }
    const plugin = sdk.browserTracingIntegration()
    const context = { client, window: target, router }
    plugin.setup(context)
    plugin.setup(context)
    expect(router.beforeEach).toHaveBeenCalledTimes(1)
    expect(router.afterEach).toHaveBeenCalledTimes(1)
    expect(sdk.getClientState()).toBeUndefined()
    await target.fetch('/api/orders')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toBe('/api/orders')
    expect(fetch.mock.calls[0][1]).toBeUndefined()
    target.dispatchEvent(new Event('pagehide'))
    await client.flush()
    expect(transport.envelopes.some(e => e.type === 'transaction')).toBe(true)
    expect(transport.events).toHaveLength(0)
  })
})


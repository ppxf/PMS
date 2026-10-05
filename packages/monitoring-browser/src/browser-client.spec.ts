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

describe('browser monitoring', () => {
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
  it('provides a trace-only entry without automatic error listeners', async () => {
    const target = new EventTarget()
    vi.stubGlobal('window', target)
    const sdk = await import('./index.js')
    const transport = new RecordingTransport()
    const options = { dsn, transport, tracesSampleRate: 1, browserTracing: false }
    const state = sdk.initTraces(options)
    expect(sdk.initTraces(options)).toBe(state)
    target.dispatchEvent(Object.assign(new Event('error'), { message: 'not captured' }))
    target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'not captured' }))
    const span = sdk.startInactiveSpan({ name: 'checkout', op: 'task' })
    span.end()
    await sdk.flush()
    expect(transport.events).toHaveLength(0)
    expect(transport.envelopes.some(e => e.type === 'transaction')).toBe(true)
    expect(() => sdk.init({ dsn, transport, tracesSampleRate: 1, browserTracing: false })).toThrow('different browser options')
  })

  it('exposes the BrowserTracing integration for explicit initialization', async () => {
    vi.stubGlobal('window', undefined)
    const sdk = await import('./index.js')
    const integration = sdk.browserTracingIntegration()
    expect(integration.name).toBe('BrowserTracing')
    const transport = new RecordingTransport()
    expect(() => sdk.init({ dsn, transport, errorMonitoring: false, integrations: [integration], tracesSampleRate: 1 })).not.toThrow()
  })

  it('installs automatic HTTP tracing through the trace-only integration entry', async () => {
    const target = new EventTarget() as Window
    const doc = Object.assign(new EventTarget(), { readyState: 'complete', visibilityState: 'visible' })
    const originalFetch = () => Promise.resolve(new Response('', { status: 200 }))
    Object.assign(target, {
      document: doc, location: new URL('https://app.test/orders'),
      performance: { now: () => performance.now(), getEntriesByType: () => [] },
      fetch: originalFetch,
    })
    vi.stubGlobal('window', target)
    const sdk = await import('./index.js')
    const transport = new RecordingTransport()
    sdk.initTraces({ dsn, transport, integrations: [sdk.browserTracingIntegration()], tracesSampleRate: 1 })
    await target.fetch('/api/orders')
    target.dispatchEvent(new Event('pagehide'))
    await sdk.flush()
    const spans = transport.envelopes.filter(e => e.type === 'transaction').flatMap(e => e.transaction.spans)
    expect(spans.some(s => s.op === 'pageload')).toBe(true)
    expect(spans.find(s => s.op === 'http.client')).toMatchObject({ name: 'GET /api/orders', httpStatusCode: 200 })
    expect(transport.events).toHaveLength(0)
  })
  it('initializes without a window and identifies the browser SDK', async () => {
    vi.stubGlobal('window', undefined)
    const sdk = await import('./index.js')
    const transport = new RecordingTransport()
    const state = sdk.init({ dsn, transport })
    expect(state.projectId).toBe('browser-project')
    expect(sdk.getClientState()).toBe(state)
    expect(transport.envelopes[0]).toMatchObject({
      type: 'client_report', sdk: { name: '@pms/monitoring-browser', version: '0.1.0' },
    })
    await sdk.captureException(new Error('manual'))
    expect(transport.events[0]?.event).toMatchObject({ source: 'manual', message: 'manual' })
  })

  it('captures browser errors and rejections exactly once after repeated installation', async () => {
    const target = new EventTarget()
    vi.stubGlobal('window', target)
    const sdk = await import('./index.js')
    const transport = new RecordingTransport()
    const first = sdk.init({ dsn, transport })
    expect(sdk.init({ dsn, transport })).toBe(first)
    sdk.installBrowserHandlers(target as Window)
    target.dispatchEvent(Object.assign(new Event('error'), { error: new Error('script') }))
    target.dispatchEvent(Object.assign(new Event('error'), { message: 'fallback' }))
    target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new Error('promise') }))
    expect(transport.events.map(({ event }) => [event.source, event.message])).toEqual([
      ['window', 'script'], ['window', 'fallback'], ['unhandledrejection', 'promise'],
    ])
    expect(transport.envelopes.filter((e) => e.type === 'client_report')).toHaveLength(1)
  })

  it('isolates synchronous and asynchronous transport failures from browser handlers', async () => {
    const target = new EventTarget()
    vi.stubGlobal('window', target)
    const sdk = await import('./index.js')
    const transport: Transport = { send: () => { throw new Error('offline') } }
    sdk.init({ dsn, transport })
    expect(() => target.dispatchEvent(Object.assign(new Event('error'), { message: 'script' }))).not.toThrow()
    await sdk.captureException(new Error('manual'))
  })

  it('rejects conflicting initialization before adding listeners', async () => {
    const sdk = await import('./index.js')
    const transport = new RecordingTransport()
    sdk.init({ dsn, transport })
    const target = new EventTarget()
    vi.stubGlobal('window', target)
    expect(() => sdk.init({ dsn, environment: 'other', transport })).toThrow('different options')
    target.dispatchEvent(Object.assign(new Event('error'), { message: 'not installed' }))
    expect(transport.events).toHaveLength(0)
  })
})

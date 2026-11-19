import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MonitoringEnvelope, Transport } from '@pmspulse/monitoring-core'

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
    const { createMonitoringClient } = await import('@pmspulse/monitoring-core')
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


it('keeps the initial router navigation and redirects in one pageload', async () => {
  vi.useFakeTimers()
  try {
    const { createMonitoringClient } = await import('@pmspulse/monitoring-core')
    const { browserTracingIntegration } = await import('./index.js')
    const transport = new RecordingTransport()
    const client = createMonitoringClient()
    client.init({dsn, transport, tracesSampleRate: 1})
    const target = new EventTarget() as Window
    Object.assign(target, {document: Object.assign(new EventTarget(), {readyState:'complete', visibilityState:'visible'}),
      location:new URL('https://app.test/'),performance:{now:()=>performance.now(),getEntriesByType:()=>[]}})
    const initial = {matched:[],path:'/'}
    const checkout = {matched:[{path:'/checkout'}],path:'/checkout'}
    const orders = {matched:[{path:'/orders/:id'}],path:'/orders/123'}
    const router = {currentRoute:{value:initial},beforeEach:vi.fn(),afterEach:vi.fn()}
    browserTracingIntegration().setup({client,window:target,router})
    const before = router.beforeEach.mock.calls[0][0], after = router.afterEach.mock.calls[0][0]
    before(checkout,initial)
    await vi.advanceTimersByTimeAsync(2500)
    await client.flush()
    expect(transport.envelopes.filter(e=>e.type==='transaction')).toHaveLength(0)
    before(orders,initial)
    after(orders,initial)
    await vi.advanceTimersByTimeAsync(2100)
    before(checkout,orders)
    after(checkout,orders)
    await vi.advanceTimersByTimeAsync(2100)
    await client.flush()
    const roots = transport.envelopes.filter(e=>e.type==='transaction').flatMap(e=>e.transaction.spans).filter(s=>s.isTransaction)
    expect(roots).toHaveLength(2)
    expect(roots[0]).toMatchObject({op:'pageload',name:'/orders/:id',pageRoute:'/orders/:id',status:'ok',truncated:false})
    expect(roots[1]).toMatchObject({op:'navigation',name:'/checkout',status:'ok',truncated:false})
  } finally {vi.useRealTimers()}
})

it.each(['cancelled initial navigation', 'ready unmatched route'])('records navigation after %s', async (scenario) => {
  vi.useFakeTimers()
  try {
    const { createMonitoringClient } = await import('@pmspulse/monitoring-core')
    const { browserTracingIntegration } = await import('./index.js')
    const transport = new RecordingTransport(), client = createMonitoringClient()
    client.init({dsn,transport,tracesSampleRate:1})
    const target = new EventTarget() as Window
    Object.assign(target,{document:Object.assign(new EventTarget(),{readyState:'complete',visibilityState:'visible'}),location:new URL('https://app.test/'),performance:{now:()=>performance.now(),getEntriesByType:()=>[]}})
    const from = {matched:[],path:scenario==='ready unmatched route' ? '/missing':'/'}
    const to = {matched:[{path:'/orders'}],path:'/orders'}
    const router = {currentRoute:{value:from},beforeEach:vi.fn(),afterEach:vi.fn()}
    browserTracingIntegration().setup({client,window:target,router})
    const before=router.beforeEach.mock.calls[0][0],after=router.afterEach.mock.calls[0][0]
    if(scenario==='cancelled initial navigation') {before(to,from);after(to,from,new Error('cancelled'))}
    before(to,from);after(to,from)
    await vi.advanceTimersByTimeAsync(2100);await client.flush()
    const spans=transport.envelopes.filter(e=>e.type==='transaction').flatMap(e=>e.transaction.spans)
    expect(spans.filter(s=>s.op==='navigation')).toHaveLength(1)
    expect(spans.find(s=>s.op==='navigation')).toMatchObject({name:'/orders',status:'ok',truncated:false})
  }finally{vi.useRealTimers()}
})

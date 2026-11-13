import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBrowserTracing } from './browser-tracing.js'
import { createMonitoringClient } from './client.js'
import type { MonitoringEnvelope } from './types.js'

afterEach(() => vi.useRealTimers())

function setup(navigationStart?: number) {
  const envelopes: MonitoringEnvelope[] = []
  const client = createMonitoringClient()
  client.init({ dsn: 'https://key@monitor.test/api/sdk/project', tracesSampleRate: 1, transport: { send: (e) => { envelopes.push(e); return Promise.resolve() } } })
  const w = new EventTarget() as Window
  const doc = new EventTarget()
  Object.assign(doc, { readyState: 'complete', visibilityState: 'visible' })
  const requests: Promise<Response>[] = []
  Object.assign(w, {
    document: doc, location: new URL('https://app.test/page'),
    performance: { now: () => performance.now(), getEntriesByType: (type: string) => type === 'navigation' && navigationStart !== undefined ? [{ startTime: navigationStart }] : [] },
    fetch: () => { const response = Promise.resolve(new Response('', { status: 200 })); requests.push(response); return response },
  })
  const tracing = createBrowserTracing(client)
  tracing.install(w)
  return { client, tracing, envelopes, w, requests }
}

describe('browser tracing instrumentation', () => {
  it('collects completed static assets before sealing the page without duplicating HTTP entries', async () => {
    const { client, tracing, envelopes, w } = setup(0)
    const entry = {
      entryType: 'resource',
      name: 'https://app.test/assets/app.js?token=private#fragment', initiatorType: 'script',
      startTime: 0, duration: 10, responseEnd: 10, requestStart: 2, responseStart: 5,
      domainLookupStart: 0, domainLookupEnd: 0, connectStart: 0, connectEnd: 0,
      secureConnectionStart: 0, transferSize: 150, encodedBodySize: 100, decodedBodySize: 200,
    }
    Object.assign(w.performance, { getEntriesByType: (type: string) => type === 'resource' ? [entry, { ...entry, initiatorType: 'fetch', name: 'https://app.test/api/data' }] : [] })
    tracing.endNavigation()
    await client.flush()
    const spans = envelopes.filter(e => e.type === 'transaction').flatMap(e => e.transaction.spans)
    const resource = spans.find(s => s.op === 'resource.script')
    expect(resource).toMatchObject({ durationMs: 10, isTransaction: false, parentSpanId: spans[0].spanId, transferSize: 150 })
    expect(spans.filter(s => s.op.startsWith('resource.'))).toHaveLength(1)
    expect(JSON.stringify(spans)).not.toContain('private')
    client.resetClientForTests()
  })
  it('does not re-coerce native XHR open inputs or introduce new business exceptions', async () => {
    const { client, tracing, w } = setup()
    class NativeBoundary extends EventTarget {
      open(method: string, url: string) { String(method); String(url) }
      send() { /* Platform no-op. */ }
    }
    Object.assign(w, { XMLHttpRequest: NativeBoundary })
    const otherTracing = createBrowserTracing(client)
    otherTracing.install(w)
    let coercions = 0
    const url = { toString() { if (++coercions > 1) throw new Error('re-coercion'); return '/probe' } }
    const method = { toString: () => 'GET' }
    expect(() => new NativeBoundary().open(method as never, url as never)).not.toThrow()
    expect(coercions).toBe(1)
    tracing.endNavigation('page_hidden')
    otherTracing.endNavigation('page_hidden')
    await client.flush()
  })
  it('captures XHR completion and actual cancellation with independent status semantics', async () => {
    const { client, tracing, envelopes, w } = setup()
    class FakeXhr extends EventTarget {
      status = 0
      body: unknown
      address = ''
      open(method: string, url: string) { this.address = `${method} ${url}` }
      send(body?: unknown) { this.body = body }
    }
    Object.assign(w, { XMLHttpRequest: FakeXhr })
    const xhrTracing = createBrowserTracing(client)
    xhrTracing.install(w)
    const first = new FakeXhr()
    first.open('POST', '/api/test?secret=private')
    first.send('original-body')
    expect(first.body).toBe('original-body')
    first.status = 404
    first.dispatchEvent(new Event('load'))
    first.dispatchEvent(new Event('loadend'))
    const cancelled = new FakeXhr()
    cancelled.open('GET', '/api/cancel')
    cancelled.send()
    cancelled.dispatchEvent(new Event('abort'))
    cancelled.dispatchEvent(new Event('loadend'))
    tracing.endNavigation('page_hidden')
    xhrTracing.endNavigation('page_hidden')
    await client.flush()
    const spans = envelopes.filter((e) => e.type === 'transaction').flatMap((e) => e.transaction.spans)
    expect(spans.find((s) => s.name === 'POST /api/test')).toMatchObject({ status: 'error', httpStatusCode: 404, attributes: { 'http.instrumentation': 'xhr' } })
    expect(spans.find((s) => s.name === 'GET /api/cancel')).toMatchObject({ status: 'cancelled', endReason: 'abort' })
  })
  it('keeps fetch promise identity and strips query data while excluding PMS requests', async () => {
    const { client, tracing, envelopes, w, requests } = setup()
    const response = w.fetch('/api/orders?token=secret')
    expect(response).toBe(requests[0])
    await response
    await w.fetch('https://other-monitor.test/custom/sdk/other/envelope')
    tracing.endNavigation('page_hidden')
    await client.flush()
    const spans = envelopes.filter((e) => e.type === 'transaction').flatMap((e) => e.transaction.spans)
    expect(spans.filter((s) => s.op === 'http.client')).toHaveLength(1)
    expect(spans.find((s) => s.op === 'http.client')).toMatchObject({ name: 'GET /api/orders', httpStatusCode: 200, attributes: { 'http.instrumentation': 'fetch' } })
    expect(JSON.stringify(spans)).not.toContain('secret')
    expect(spans.find((s) => s.op === 'http.client')?.ttfbMs).toBeUndefined()
  })

  it('collects independent clients with composable wrappers', async () => {
    const { client, tracing, envelopes, w } = setup()
    const other: MonitoringEnvelope[] = []
    const second = createMonitoringClient()
    second.init({ dsn: 'https://other@monitor.test/api/sdk/other', tracesSampleRate: 1, transport: { send: (e) => { other.push(e); return Promise.resolve() } } })
    const secondTracing = createBrowserTracing(second)
    secondTracing.install(w)
    await w.fetch('/api/test')
    tracing.endNavigation('page_hidden')
    secondTracing.endNavigation('page_hidden')
    await Promise.all([client.flush(), second.flush()])
    for (const list of [envelopes, other]) expect(list.filter((e) => e.type === 'transaction').flatMap((e) => e.transaction.spans).filter((s) => s.op === 'http.client')).toHaveLength(1)
  })
})

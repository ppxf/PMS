import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBrowserTracing } from './browser-tracing.js'
import { createMonitoringClient } from './client.js'
import type { MonitoringEnvelope } from './types.js'

afterEach(() => vi.useRealTimers())

function setup(navigationStart?: number, fetcher?: () => Promise<Response>) {
  const envelopes: MonitoringEnvelope[] = []
  const client = createMonitoringClient()
  client.init({ dsn: 'https://key@monitor.test/api/sdk/project', tracesSampleRate: 1, enableLogs: true, transport: { send: (e) => { envelopes.push(e); return Promise.resolve() } } })
  const w = new EventTarget() as Window
  const doc = new EventTarget()
  Object.assign(doc, { readyState: 'complete', visibilityState: 'visible' })
  const requests: Promise<Response>[] = []
  Object.assign(w, {
    document: doc, location: new URL('https://app.test/page'),
    performance: { now: () => performance.now(), getEntriesByType: (type: string) => type === 'navigation' && navigationStart !== undefined ? [{ startTime: navigationStart }] : [] },
    fetch: fetcher ?? (() => { const response = Promise.resolve(new Response('', { status: 200 })); requests.push(response); return response }),
  })
  const tracing = createBrowserTracing(client)
  tracing.install(w)
  return { client, tracing, envelopes, w, requests }
}

describe('browser tracing instrumentation', () => {
  it('binds HTTP status errors to the request span without changing the response', async () => {
    const response = new Response('private response', { status: 500 })
    const { client, tracing, w, envelopes } = setup(undefined, () => Promise.resolve(response))
    expect(await w.fetch('/api/failure?token=private')).toBe(response)
    tracing.endNavigation()
    await client.flush()
    const request = envelopes.filter(e => e.type === 'transaction').flatMap(e => e.transaction.spans).find(span => span.op === 'http.client')!
    const events = envelopes.filter(e => e.type === 'event')
    expect(events).toHaveLength(1)
    expect(events[0].event).toMatchObject({ source: 'http', contexts: { trace: { traceId: request.traceId, spanId: request.spanId } } })
    expect(request.status).toBe('error')
    expect(JSON.stringify(events)).not.toContain('private')
    client.resetClientForTests()
  })

  it('keeps concurrent network exceptions on their own requests after unwinding', async () => {
    const failures = [new TypeError('first offline'), new TypeError('second offline')]
    const promises = failures.map(error => Promise.reject(error))
    let index = 0
    const { client, tracing, w, envelopes } = setup(undefined, () => promises[index++])
    const first = w.fetch('/api/first')
    const second = w.fetch('/api/second')
    expect(first).toBe(promises[0])
    expect(second).toBe(promises[1])
    await Promise.allSettled([first, second])
    // Browser global handlers see the same objects after the requests settle.
    for (const failure of failures) await client.captureException(failure, { source: 'unhandledrejection' })
    tracing.endNavigation()
    await client.flush()
    const events = envelopes.filter(e => e.type === 'event')
    expect(events).toHaveLength(2)
    const spans = envelopes.filter(e => e.type === 'transaction').flatMap(e => e.transaction.spans)
    for (const [i, event] of events.entries()) {
      expect(event.event.contexts?.trace?.spanId).toBe(spans.find(span => span.name === `GET /api/${i === 0 ? 'first' : 'second'}`)?.spanId)
    }
    client.resetClientForTests()
  })

  it('captures XHR status, network and timeout errors once on their respective request spans', async () => {
    const { client, tracing, w, envelopes } = setup()
    class FakeXhr extends EventTarget {
      status = 0
      open(method: string, url: string) { void method; void url }
      send() { /* Native boundary stub. */ }
    }
    Object.assign(w, { XMLHttpRequest: FakeXhr })
    const xhrTracing = createBrowserTracing(client)
    xhrTracing.install(w)
    for (const kind of ['status', 'network', 'timeout', 'abort', 'success']) {
      const xhr = new FakeXhr()
      xhr.open('GET', `/api/${kind}?token=private`)
      xhr.send()
      xhr.status = kind === 'status' ? 404 : kind === 'success' ? 200 : 0
      const event = kind === 'network' ? 'error' : kind === 'status' || kind === 'success' ? 'load' : kind
      xhr.dispatchEvent(new Event(event))
      // A second terminal signal must not create another event.
      xhr.dispatchEvent(new Event('load'))
      xhr.dispatchEvent(new Event('loadend'))
    }
    tracing.endNavigation()
    xhrTracing.endNavigation()
    await client.flush()
    const events = envelopes.filter(e => e.type === 'event')
    expect(events).toHaveLength(3)
    const spans = envelopes.filter(e => e.type === 'transaction').flatMap(e => e.transaction.spans)
    for (const [index, kind] of ['status', 'network', 'timeout'].entries()) {
      expect(events[index].event).toMatchObject({ source: 'http', contexts: { trace: { spanId: spans.find(span => span.name === `GET /api/${kind}`)?.spanId } } })
    }
    expect(JSON.stringify(events)).not.toContain('private')
    client.resetClientForTests()
  })

  it('preserves synchronous fetch exceptions and binds them to the request', async () => {
    const failure = new TypeError('bad request')
    const { client, tracing, w, envelopes } = setup(undefined, () => { throw failure })
    expect(() => w.fetch('/api/sync')).toThrow(failure)
    await client.captureException(failure, { source: 'window' })
    tracing.endNavigation()
    await client.flush()
    const request = envelopes.filter(e => e.type === 'transaction').flatMap(e => e.transaction.spans).find(span => span.op === 'http.client')!
    expect(envelopes.filter(e => e.type === 'event')).toHaveLength(1)
    expect(envelopes.find(e => e.type === 'event')?.event.contexts?.trace?.spanId).toBe(request.spanId)
    client.resetClientForTests()
  })

  it('does not report caller cancellation with a custom abort reason as a network error', async () => {
    const controller = new AbortController()
    const reason = new Error('user cancelled')
    const { client, tracing, w, envelopes } = setup(undefined, () => {
      controller.abort(reason)
      return Promise.reject(reason)
    })
    await expect(w.fetch('/api/cancel', { signal: controller.signal })).rejects.toBe(reason)
    tracing.endNavigation()
    await client.flush()
    expect(envelopes.filter(e => e.type === 'event')).toHaveLength(0)
    expect(envelopes.filter(e => e.type === 'transaction').flatMap(e => e.transaction.spans).find(span => span.op === 'http.client')).toMatchObject({ status: 'cancelled', endReason: 'abort' })
    client.resetClientForTests()
  })
  it('preserves log correlation after the page measurement deadline and page hide', async () => {
    vi.useFakeTimers()
    let finish!: (response: Response) => void
    const { client, tracing, w, envelopes } = setup(undefined, () => new Promise(resolve => { finish = resolve }))
    const page = tracing.startNavigation('/slow')
    tracing.navigationReady()
    const request = w.fetch('/api/slow')
    await vi.advanceTimersByTimeAsync(31000)
    client.logger.info('after deadline')
    Object.assign(w.document, { visibilityState: 'hidden' })
    w.document.dispatchEvent(new Event('visibilitychange'))
    client.logger.info('after hide')
    await client.flush()
    const logs = envelopes.filter(e => e.type === 'logs').flatMap(e => e.logs)
    expect(logs.map(log => log.traceId)).toEqual([page.context.traceId, page.context.traceId])
    finish(new Response('', { status: 200 }))
    await request
    client.resetClientForTests()
  })

  it('retains a pending HTTP request on its original page while a new route starts', async () => {
    vi.useFakeTimers()
    let finish!: (response: Response) => void
    const { client, tracing, w, envelopes } = setup(undefined, () => new Promise(resolve => { finish = resolve }))
    const oldPage = tracing.startNavigation('/old')
    tracing.navigationReady()
    const request = w.fetch('/api/slow')
    const newPage = tracing.startNavigation('/new')
    tracing.navigationReady()
    await vi.advanceTimersByTimeAsync(2000)
    expect(envelopes.filter(e => e.type === 'transaction').flatMap(e => e.transaction.spans).some(span => span.op === 'http.client')).toBe(false)
    finish(new Response('', { status: 200 }))
    await request
    await vi.advanceTimersByTimeAsync(1000)
    const spans = envelopes.filter(e => e.type === 'transaction').flatMap(e => e.transaction.spans)
    expect(spans.find(span => span.op === 'http.client')).toMatchObject({ parentSpanId: oldPage.context.spanId, pageRoute: '/old', status: 'ok', truncated: false })
    expect(spans.find(span => span.spanId === oldPage.context.spanId)).toMatchObject({ truncated: false, status: 'ok', attributes: { 'pms.measurement.status': 'lifecycle' } })
    expect(newPage.context.traceId).toBe(oldPage.context.traceId)
    client.resetClientForTests()
  })
  it('allows background requests to finish, but seals outstanding measurements on page leave and starts a new interval on restore', async () => {
    vi.useFakeTimers()
    let finish!: (response: Response) => void
    const { client, tracing, w, envelopes } = setup(undefined, () => new Promise(resolve => { finish = resolve }))
    const page = tracing.startNavigation('/old')
    tracing.navigationReady()
    const request = w.fetch('/api/pending')
    Object.assign(w.document, { visibilityState: 'hidden' })
    w.document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(2000)
    expect(envelopes.filter(e => e.type === 'transaction').flatMap(e => e.transaction.spans).some(span => span.op === 'http.client')).toBe(false)
    w.dispatchEvent(new Event('pagehide'))
    await client.flush()
    const spans = envelopes.filter(e => e.type === 'transaction').flatMap(e => e.transaction.spans)
    expect(spans.find(span => span.op === 'http.client')).toMatchObject({ truncated: false, status: 'cancelled', attributes: { 'pms.measurement.status': 'interrupted' } })
    finish(new Response('', { status: 200 }))
    await request
    Object.assign(w.document, { visibilityState: 'visible' })
    const restored = new Event('pageshow')
    Object.defineProperty(restored, 'persisted', { value: true })
    w.dispatchEvent(restored)
    await vi.advanceTimersByTimeAsync(2000)
    const pages = envelopes.filter(e => e.type === 'transaction').flatMap(e => e.transaction.spans).filter(span => span.op === 'navigation')
    expect(new Set(pages.map(span => span.spanId)).size).toBe(2)
    expect(pages.every(span => span.traceId === page.context.traceId)).toBe(true)
    client.resetClientForTests()
  })

  it('attributes post-idle HTTP to the current navigation while preserving the document trace', async () => {
    vi.useFakeTimers()
    const {client,tracing,envelopes,w}=setup()
    await vi.advanceTimersByTimeAsync(2500)
    const page=tracing.startNavigation('/orders')
    tracing.navigationReady()
    await vi.advanceTimersByTimeAsync(2500)
    await w.fetch('/api/orders')
    await client.flush()
    const spans=envelopes.filter(e=>e.type==='transaction').flatMap(e=>e.transaction.spans)
    expect(spans.find(span=>span.name==='GET /api/orders')).toMatchObject({
      parentSpanId:page.context.spanId,traceId:page.context.traceId,pageRoute:'/orders',
    })
    tracing.endNavigation('page_hidden')
    client.resetClientForTests()
  })
  it('retains the document trace across idle requests and SPA navigation', async () => {
    vi.useFakeTimers()
    const { client, tracing, envelopes, w } = setup()
    await vi.advanceTimersByTimeAsync(1100)
    await client.flush()
    const initial = envelopes.find(e => e.type === 'transaction')!.transaction.spans[0]
    await w.fetch('/api/after-idle')
    const next = tracing.startNavigation('/orders')
    expect(next.context.traceId).toBe(initial.traceId)
    expect(next.context.spanId).not.toBe(initial.spanId)
    tracing.navigationReady()
    tracing.endNavigation('page_hidden')
    await client.flush()
    const spans = envelopes.filter(e => e.type === 'transaction').flatMap(e => e.transaction.spans)
    expect(spans.find(s => s.name === 'GET /api/after-idle')?.traceId).toBe(initial.traceId)
    client.resetClientForTests()
  })
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
    second.init({ dsn: 'https://other@monitor.test/api/sdk/other', tracesSampleRate: 1, enableLogs: true, transport: { send: (e) => { other.push(e); return Promise.resolve() } } })
    const secondTracing = createBrowserTracing(second)
    secondTracing.install(w)
    await w.fetch('/api/test')
    tracing.endNavigation('page_hidden')
    secondTracing.endNavigation('page_hidden')
    await Promise.all([client.flush(), second.flush()])
    for (const list of [envelopes, other]) expect(list.filter((e) => e.type === 'transaction').flatMap((e) => e.transaction.spans).filter((s) => s.op === 'http.client')).toHaveLength(1)
  })
})

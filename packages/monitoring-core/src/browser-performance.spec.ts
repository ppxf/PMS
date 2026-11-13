import { describe, expect, it, vi } from 'vitest'
import { createBrowserPerformance } from './browser-performance.js'
import type { SpanHandle, SpanOptions } from './tracing-types.js'

function resource(overrides: Partial<PerformanceResourceTiming> = {}) {
  return {
    entryType: 'resource', name: 'https://app.test/assets/app.js?token=private#x',
    initiatorType: 'script', startTime: 10, duration: 80, responseEnd: 90,
    domainLookupStart: 12, domainLookupEnd: 14, connectStart: 14, connectEnd: 20,
    secureConnectionStart: 16, requestStart: 20, responseStart: 60,
    transferSize: 900, encodedBodySize: 600, decodedBodySize: 1200,
    nextHopProtocol: 'h2', ...overrides,
  } as PerformanceResourceTiming
}

function setup(entries: PerformanceResourceTiming[] = [], navigation?: Partial<PerformanceNavigationTiming>) {
  const spans: { options: SpanOptions; handle: SpanHandle; end: ReturnType<typeof vi.fn> }[] = []
  const root = {
    context: { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), sampled: true },
    ended: false, span: { droppedSpanCount: 0, truncated: false },
  } as SpanHandle
  const client = { startInactiveSpan: (options: SpanOptions) => {
    const end = vi.fn()
    const attributes = { ...options.attributes }
    const handle = {
      end, span: { attributes }, setAttribute: (key: string, value: unknown) => { attributes[key] = value as string },
      setMeasurements: vi.fn(),
    } as unknown as SpanHandle
    spans.push({ options, handle, end })
    return handle
  } }
  const w = {
    location: new URL('https://app.test/'),
    performance: { getEntriesByType: (type: string) => type === 'resource' ? entries : navigation ? [{ entryType: 'navigation', ...navigation }] : [] },
  } as unknown as Window
  return { spans, root, client, w }
}

describe('browser performance collector', () => {
  it('records historical timing, sanitizes resource URLs and retains size/phase measurements', () => {
    const { client, w, root, spans } = setup([resource()])
    const collector = createBrowserPerformance(client, w, () => false)
    collector.collect(root, 0, 100, true)
    collector.collect(root, 0, 100, true)
    expect(spans).toHaveLength(1)
    expect(spans[0]!.options).toMatchObject({ parent: root, op: 'resource.script', startTime: 10, name: 'https://app.test/assets/app.js' })
    expect(spans[0]!.end).toHaveBeenCalledWith('unknown', 'completed', 90)
    expect(spans[0]!.handle.setMeasurements).toHaveBeenCalledWith({ ttfbMs: 40, transferSize: 900, encodedBodySize: 600, decodedBodySize: 1200 })
    expect(spans[0]!.handle.span.attributes).toMatchObject({ 'resource.timing_available': true, 'resource.dns_duration': 2, 'resource.tls_duration': 4 })
    expect(JSON.stringify(spans[0]!.options)).not.toContain('private')
  })

  it('omits restricted cross-origin measurements without inventing zero values', () => {
    const { client, w, root, spans } = setup([resource({ name: 'https://cdn.test/app.css', initiatorType: 'link', requestStart: 0, responseStart: 0, domainLookupStart: 0, domainLookupEnd: 0 })])
    createBrowserPerformance(client, w, () => false).collect(root, 0, 100, true)
    expect(spans[0]!.options.op).toBe('resource.css')
    expect(spans[0]!.handle.span.attributes).toMatchObject({ 'resource.timing_available': false })
    expect(spans[0]!.handle.setMeasurements).not.toHaveBeenCalled()
  })

  it('skips HTTP wrappers, excluded/invalid URLs, unfinished resources and other navigation windows', () => {
    const entries = [resource({ initiatorType: 'fetch' }), resource({ initiatorType: 'xmlhttprequest' }),
      resource({ name: 'https://app.test/api/sdk/p/envelope' }), resource({ name: 'data:text/plain,x' }),
      resource({ startTime: 2 }), resource({ startTime: 20, responseEnd: 150 }), resource({ startTime: NaN })]
    const { client, w, root, spans } = setup(entries)
    createBrowserPerformance(client, w, (url) => url.includes('/sdk/')).collect(root, 10, 100, false)
    expect(spans).toHaveLength(0)
  })

  it('classifies images/fonts and records navigation phases only on the initial document', () => {
    const { client, w, root, spans } = setup([resource({ name: 'https://app.test/a.woff2', initiatorType: 'css' }), resource({ name: 'https://app.test/a.webp', initiatorType: 'img' })], {
      startTime: 0, fetchStart: 2, domainLookupStart: 3, domainLookupEnd: 4, connectStart: 4, connectEnd: 8,
      secureConnectionStart: 5, requestStart: 9, responseStart: 20, responseEnd: 30,
      domContentLoadedEventStart: 40, domContentLoadedEventEnd: 41, loadEventStart: 50, loadEventEnd: 51,
    })
    createBrowserPerformance(client, w, () => false).collect(root, 0, 100, true)
    expect(spans.map((span) => span.options.op)).toEqual(expect.arrayContaining(['resource.font', 'resource.img', 'browser.dns', 'browser.connect', 'browser.tls', 'browser.request', 'browser.response', 'browser.dom_content_loaded_event', 'browser.load_event']))
    expect(spans.find((span) => span.options.op === 'browser.request')!.end).toHaveBeenCalledWith('ok', 'completed', 20)
    const other = setup([], { domainLookupStart: 1, domainLookupEnd: 4 })
    createBrowserPerformance(other.client, other.w, () => false).collect(other.root, 0, 100, false)
    expect(other.spans).toHaveLength(0)
  })

  it('reserves capacity for business spans and reports excess resources', () => {
    const { client, w, root, spans } = setup(Array.from({ length: 160 }, (_, i) => resource({ name: `https://app.test/${i}.js` })))
    createBrowserPerformance(client, w, () => false).collect(root, 0, 100, true)
    expect(spans).toHaveLength(150)
    expect(root.span).toMatchObject({ truncated: true, droppedSpanCount: 10 })
  })

  it('drains buffered observer records once and disconnects cleanly', () => {
    const { client, w, root, spans } = setup()
    let callback: PerformanceObserverCallback | undefined
    const observe = vi.fn(), disconnect = vi.fn()
    const takeRecords = vi.fn(() => [resource()])
    class Observer {
      constructor(cb: PerformanceObserverCallback) { callback = cb }
      observe = observe
      disconnect = disconnect
      takeRecords = takeRecords
    }
    Object.assign(w, { PerformanceObserver: Observer })
    const collector = createBrowserPerformance(client, w, () => false)
    expect(observe).toHaveBeenCalledWith({ type: 'resource', buffered: true })
    callback!({ getEntries: () => [resource()] } as unknown as PerformanceObserverEntryList, {} as PerformanceObserver)
    collector.collect(root, 0, 100, true)
    expect(spans).toHaveLength(1)
    collector.disconnect()
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('tolerates unsupported observers and ignores unsampled or completed roots', () => {
    const { client, w, root, spans } = setup([resource()])
    class UnsupportedObserver {
      observe() { throw new Error('unsupported resource observations') }
      disconnect() { throw new Error('partial implementation') }
    }
    Object.assign(w, { PerformanceObserver: UnsupportedObserver })
    const collector = createBrowserPerformance(client, w, () => false)
    root.context.sampled = false
    collector.collect(root, 0, 100, true)
    expect(spans).toHaveLength(0)
    root.context.sampled = true
    collector.collect(root, 0, 100, true)
    expect(spans).toHaveLength(1)
    collector.disconnect()
    collector.collect(root, 0, 100, true)
    expect(spans).toHaveLength(1)
  })
})

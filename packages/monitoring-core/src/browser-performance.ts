import type { SpanHandle, SpanOptions } from './tracing-types.js'

interface Client { startInactiveSpan(options: SpanOptions): SpanHandle }
const LIMIT = 150
const finite = (value: number) => Number.isFinite(value) && value >= 0

/** Read completed browser timings without changing the page's resource buffer. */
export function createBrowserPerformance(client: Client, w: Window, excluded: (url: string) => boolean) {
  const pending = new Map<string, PerformanceResourceTiming>()
  const consumed = new Map<string, number>()
  const budgets = new WeakMap<SpanHandle, number>()
  let observer: PerformanceObserver | undefined
  let disconnected = false
  const key = (entry: PerformanceResourceTiming) => `${entry.name}:${entry.initiatorType}:${entry.startTime}:${entry.responseEnd}:${entry.duration}`
  function enqueue(entries: PerformanceEntry[]) {
    for (const item of entries) {
      if (item.entryType !== 'resource') continue
      const entry = item as PerformanceResourceTiming
      if (pending.size >= 1000 && !pending.has(key(entry))) pending.delete(pending.keys().next().value!)
      pending.set(key(entry), entry)
    }
  }
  try {
    const Observer = (w as unknown as { PerformanceObserver?: typeof PerformanceObserver }).PerformanceObserver
    if (Observer) {
      observer = new Observer((list) => { if (!disconnected) enqueue(list.getEntries()) })
      observer.observe({ type: 'resource', buffered: true })
    }
  } catch {
    try { observer?.disconnect() } catch { /* Partially supported observer. */ }
    observer = undefined
  }

  function read(type: string): PerformanceEntry[] {
    try { return w.performance.getEntriesByType(type) } catch { return [] }
  }
  function clean(input: string) {
    try {
      const url = new URL(input, w.location.href)
      if (!['http:', 'https:'].includes(url.protocol) || excluded(url.href)) return undefined
      return { name: `${url.origin}${url.pathname}`.slice(0, 512), origin: url.origin.slice(0, 256), path: url.pathname.slice(0, 256), sameOrigin: url.origin === w.location.origin }
    } catch { return undefined }
  }
  function claim(root: SpanHandle) {
    const count = budgets.get(root) ?? 0
    if (count >= LIMIT) {
      root.span.truncated = true
      root.span.droppedSpanCount++
      return false
    }
    budgets.set(root, count + 1)
    return true
  }
  function collect(root: SpanHandle, start: number, end: number, pageload: boolean) {
    if (disconnected || root.ended || !root.context.sampled || !finite(start) || !finite(end) || end < start) return
    for (const [signature, time] of consumed) if (time < start) consumed.delete(signature)
    try { enqueue(observer?.takeRecords() ?? []) } catch { /* Unsupported observer. */ }
    enqueue(read('resource'))
    if (pageload) {
      const navigation = read('navigation')[0] as PerformanceNavigationTiming | undefined
      if (navigation) {
        const stages: [string, number, number, boolean?][] = [
          ['cache', navigation.fetchStart, navigation.domainLookupStart],
          ['dns', navigation.domainLookupStart, navigation.domainLookupEnd],
          ['connect', navigation.connectStart, navigation.connectEnd],
          ['tls', navigation.secureConnectionStart, navigation.connectEnd],
          ['request', navigation.requestStart, navigation.responseStart],
          ['response', navigation.responseStart, navigation.responseEnd],
          ['dom_content_loaded_event', navigation.domContentLoadedEventStart, navigation.domContentLoadedEventEnd, true],
          ['load_event', navigation.loadEventStart, navigation.loadEventEnd, true],
        ]
        for (const [stage, from, to, event] of stages) {
          const signature = `navigation:${stage}:${from}:${to}`
          if (consumed.has(signature) || !finite(from) || !finite(to) || from < start || to > end || to < from || (!event && to === from) || ((event || stage === 'tls' || stage === 'request' || stage === 'response') && from === 0)) continue
          consumed.set(signature, from)
          if (!claim(root)) continue
          const span = client.startInactiveSpan({ name: stage.replaceAll('_', ' '), op: `browser.${stage}`, parent: root, startTime: from })
          span.end('ok', 'completed', to)
        }
      }
    }
    for (const [signature, entry] of pending) {
      const from = entry.startTime, to = entry.responseEnd
      if (!finite(from) || !finite(to) || to < from || from < start) { pending.delete(signature); continue }
      if (to > end) continue
      pending.delete(signature)
      if (consumed.has(signature)) continue
      consumed.set(signature, from)
      if (['fetch', 'xmlhttprequest'].includes(entry.initiatorType)) continue
      const url = clean(entry.name)
      if (!url) continue
      if (!claim(root)) continue
      const pathname = url.path.toLowerCase()
      const initiator = entry.initiatorType
      const type = /\.(woff2?|ttf|otf|eot)$/.test(pathname) ? 'font'
        : ['img', 'image'].includes(initiator) || /\.(png|jpe?g|gif|webp|avif|svg|ico)$/.test(pathname) ? 'img'
          : initiator === 'script' || /\.(m?js)$/.test(pathname) ? 'script'
            : /\.css$/.test(pathname) || initiator === 'css' ? 'css' : 'other'
      const visible = url.sameOrigin || entry.requestStart > 0
      const span = client.startInactiveSpan({
        name: url.name, op: `resource.${type}`, parent: root, startTime: from,
        attributes: { 'resource.url': url.name.slice(0, 256), 'resource.origin': url.origin, 'resource.path': url.path, 'resource.initiator_type': initiator.slice(0, 64), 'resource.timing_available': visible },
      })
      if (visible) {
        const measurements: Parameters<SpanHandle['setMeasurements']>[0] = {}
        if (entry.requestStart > 0 && entry.responseStart >= entry.requestStart) measurements.ttfbMs = entry.responseStart - entry.requestStart
        for (const field of ['transferSize', 'encodedBodySize', 'decodedBodySize'] as const) if (finite(entry[field])) measurements[field] = entry[field]
        span.setMeasurements(measurements)
        if (entry.nextHopProtocol) span.setAttribute('network.protocol', entry.nextHopProtocol.slice(0, 64))
        const phases: [string, number, number][] = [
          ['dns', entry.domainLookupStart, entry.domainLookupEnd], ['connect', entry.connectStart, entry.connectEnd],
          ['tls', entry.secureConnectionStart, entry.connectEnd], ['request', entry.requestStart, entry.responseStart], ['response', entry.responseStart, to],
        ]
        for (const [phase, a, b] of phases) if (finite(a) && finite(b) && b >= a && (!['tls', 'request', 'response'].includes(phase) || a > 0)) span.setAttribute(`resource.${phase}_duration`, b - a)
      }
      span.end('unknown', 'completed', to)
    }
  }
  return { collect, disconnect() { disconnected = true; try { observer?.disconnect() } catch { /* Observer cleanup cannot affect the app. */ } pending.clear(); consumed.clear() } }
}

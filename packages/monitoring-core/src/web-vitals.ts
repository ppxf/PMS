import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals/attribution'
import { captureBrowserIdentity } from './browser-context.js'
import type { MonitoringInitOptions, Transport } from './types.js'
import type { TraceContext } from './tracing-types.js'
import type { WebVitalsEnvelope, WebVitalsPage, WebVitalName } from './web-vitals-types.js'

const uuid = () => globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16) })
export function createWebVitals(getTrace: () => TraceContext | undefined) {
  let generation = 0
  let page: WebVitalsPage | undefined
  let transport: Transport | undefined
  let pending: WebVitalsEnvelope[] = []
  let draining: Promise<void> | undefined
  let cleanup = () => {}
  let routeResolver: (() => string | undefined) | undefined
  const revisions = new Map<string, { value: number; revision: number }>()
  const hiddenInFlight = new Set<WebVitalsEnvelope>()
  function flushHidden() {
    if (!transport) return
    const groups = new Map<string, WebVitalsEnvelope[]>()
    for (const envelope of pending) {
      if (hiddenInFlight.has(envelope)) continue
      const group = groups.get(envelope.page.id) ?? []
      group.push(envelope); groups.set(envelope.page.id, group)
    }
    let bytes = 0
    for (const group of [...groups.values()].reverse()) {
      const latest = new Map<WebVitalName, WebVitalsEnvelope['measurements'][number]>()
      for (const envelope of group) for (const metric of envelope.measurements) {
        if ((latest.get(metric.name)?.revision ?? 0) < metric.revision) latest.set(metric.name, metric)
      }
      const batch: WebVitalsEnvelope = { ...group[group.length - 1], eventId: uuid(), sentAt: new Date().toISOString(), measurements: [...latest.values()] }
      const size = new TextEncoder().encode(JSON.stringify(batch)).byteLength
      if (bytes + size > 60_000) continue
      bytes += size
      for (const envelope of group) hiddenInFlight.add(envelope)
      // Start each keepalive upload synchronously; never wait for an earlier network response.
      try {
        void transport.send(batch).then(() => {
          const acknowledged = new Set(group)
          pending = pending.filter(envelope => !acknowledged.has(envelope))
        }).catch(() => undefined).finally(() => { for (const envelope of group) hiddenInFlight.delete(envelope) })
      } catch { for (const envelope of group) hiddenInFlight.delete(envelope) }
    }
  }
  function enqueue(measurements: WebVitalsEnvelope['measurements']) {
    if (!page) return
    pending.push({ version: 1, type: 'web_vitals', eventId: uuid(), sentAt: new Date().toISOString(), page: { ...page }, measurements })
    if (pending.length > 100) pending.splice(0, pending.length - 100)
    void flush()
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') queueMicrotask(flushHidden)
  }
  async function flush() {
    if (draining) return draining
    const token = generation
    const activeDrain = (async () => {
      while (pending.length && transport && token === generation) {
        const first = pending[0]
        try { await transport.send(first) } catch { break }
        if (pending[0] === first) pending.shift()
      }
    })()
    draining = activeDrain
    try { await activeDrain } finally { if (draining === activeDrain) draining = undefined }
  }
  function configure(options: MonitoringInitOptions, nextTransport: Transport) {
    const token = ++generation
    transport = nextTransport
    if (typeof window === 'undefined' || typeof document === 'undefined' || typeof window.addEventListener !== 'function' || typeof document.addEventListener !== 'function') return
    function start(restored = false) {
      revisions.clear()
      const trace = restored ? undefined : getTrace()
      const browser = captureBrowserIdentity().name
      const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
      const device = /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|Android/i.test(ua) ? 'mobile' : ua ? 'desktop' : 'unknown'
      const origin = !restored && typeof window.performance?.timeOrigin === 'number' && Number.isFinite(window.performance.timeOrigin) && window.performance.timeOrigin > 0 ? window.performance.timeOrigin : Date.now()
      const navigation = !restored ? window.performance?.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined : undefined
      const path = routeResolver?.() || (typeof location === 'undefined' ? '/' : location.pathname) || '/'
      page = { id: uuid(), startedAt: new Date(origin).toISOString(), route: path.slice(0,2048),
        device, ...(browser ? { browser } : {}),
        navigationType: restored ? 'back-forward-cache' : navigation?.type ?? 'navigate',
        ...(options.environment ? { environment: options.environment.slice(0,128) } : {}), ...(options.release ? { release: options.release.slice(0,128) } : {}),
        ...(trace ? { traceId: trace.traceId, spanId: trace.spanId } : {}) }
      enqueue([])
    }
    const restore = (event: Event) => { if ((event as PageTransitionEvent).persisted) start(true) }
    const hidden = () => { if (document.visibilityState === 'hidden') queueMicrotask(flushHidden) }
    const pagehide = () => { queueMicrotask(flushHidden) }
    const online = () => { void flush() }
    window.addEventListener('pageshow', restore)
    window.addEventListener('online', online)
    window.addEventListener('pagehide', pagehide)
    document.addEventListener('visibilitychange', hidden)
    cleanup = () => { window.removeEventListener('pageshow', restore); window.removeEventListener('online', online); window.removeEventListener('pagehide', pagehide); document.removeEventListener('visibilitychange', hidden) }
    queueMicrotask(() => {
      if (token !== generation) return
      start()
      const report = (metric: { name: string; id: string; value: number; attribution?: object; entries?: PerformanceEntry[] }) => {
        if (token !== generation || !page || !Number.isFinite(metric.value) || metric.value < 0) return
        const prior = revisions.get(metric.id)
        if (prior?.value === metric.value) return
        const revision = (prior?.revision ?? 0) + 1
        revisions.set(metric.id, { value: metric.value, revision })
        const attribution: Record<string, string | number | boolean> = {}
        if (metric.name === 'LCP') {
          const entry = metric.entries?.at(-1) as (PerformanceEntry & {loadTime?: number; renderTime?: number; size?: number}) | undefined
          for (const key of ['loadTime','renderTime','size'] as const) {
            const value = entry?.[key]
            if (typeof value === 'number' && Number.isFinite(value) && value >= 0) attribution[key] = value
          }
        }
        // Retain numeric timings, tag-only targets and URL paths; exclude DOM text and URL secrets.
        for (const [key, value] of Object.entries(metric.attribution ?? {})) {
          if (typeof value === 'number' && Number.isFinite(value)) attribution[key] = value
          if (key === 'interactionType' && (value === 'pointer' || value === 'keyboard')) attribution[key] = value
          if (key === 'url' && typeof value === 'string') {
            try { attribution[key] = new URL(value, 'https://redacted.invalid').pathname } catch { /* Ignore invalid resource URLs. */ }
          }
          if ((key === 'element' || key === 'interactionTarget' || key === 'target') && typeof value === 'string') {
            const tag = value.match(/^[a-z][a-z0-9-]*/i)?.[0]
            if (tag) attribution[key] = tag.toLowerCase()
          }
        }
        enqueue([{ name: metric.name as WebVitalName, metricId: metric.id, revision, value: metric.value, observedAt: new Date().toISOString(), attribution }])
      }
      for (const subscribe of [onCLS, onFCP, onINP, onLCP, onTTFB]) {
        try { subscribe(report, { reportAllChanges: true, generateTarget: node => node?.nodeType === 1 ? (node as Element).tagName.toLowerCase() : '' }) } catch { /* Unsupported browser APIs must not break initialization. */ }
      }
    })
  }
  return { configure, setRouteResolver: (resolver: () => string | undefined) => { routeResolver = resolver }, flush: async () => { await Promise.resolve(); await flush() }, reset: () => { ++generation; cleanup(); page = undefined; transport = undefined; pending = []; draining = undefined; routeResolver = undefined; hiddenInFlight.clear(); revisions.clear() } }
}

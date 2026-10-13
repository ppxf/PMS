import type { SpanHandle, SpanOptions } from './tracing-types.js'
import { matchesPropagationTarget, traceparent } from './propagation.js'

interface Client {
  startInactiveSpan(options: SpanOptions): SpanHandle
  getClientState(): { endpoint: string } | undefined
  flush(): Promise<void>
  getPropagationTargets?(): readonly string[]
}
export interface BrowserTracingOptions {
  browserTracing?: boolean
}

/** Each SDK creates its own instrumentation; no shared listeners/client state. */
export function createBrowserTracing(client: Client) {
  const windows = new WeakSet<Window>()
  let root: SpanHandle | undefined
  let idle: ReturnType<typeof setTimeout> | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined
  let pending = 0
  const resources = new WeakSet<PerformanceResourceTiming>()
  const requestStarts = new Map<string, number[]>()

  function safe(action: () => void) { try { action() } catch { /* Telemetry must not affect business. */ } }
  function later(action: () => void, ms: number) {
    return setTimeout(() => safe(action), ms)
  }
  function endRoot(reason = 'completed') {
    if (idle) clearTimeout(idle)
    if (deadline) clearTimeout(deadline)
    if (root && !root.ended) root.end(reason === 'completed' ? 'ok' : reason === 'deadline_exceeded' ? 'deadline_exceeded' : 'unknown', reason)
    root = undefined
    if (reason !== 'completed') void client.flush()
  }
  function scheduleIdle() {
    if (idle) clearTimeout(idle)
    if (root && pending === 0) idle = later(() => endRoot(), 1000)
  }
  function startNavigation(name: string, op = 'navigation', startTime?: number) {
    endRoot('navigation')
    root = client.startInactiveSpan({ name, op, pageRoute: name, startTime })
    pending = 0
    if (op === 'navigation') pending++
    deadline = later(() => endRoot('deadline_exceeded'), 30_000)
    scheduleIdle()
    return root
  }
  function navigationReady() { pending = Math.max(0, pending - 1); scheduleIdle() }
  function address(input: string, w: Window) {
    const url = new URL(input, w.location.href)
    return { raw: url.href, route: url.pathname.slice(0, 512) }
  }
  function excluded(url: string, w: Window) {
    const u = new URL(url, w.location.href)
    // Exclude every PMS SDK endpoint, including another independent SDK's destination.
    return /\/sdk\/[^/]+\/(envelope|check)(?:\/|$)/.test(u.pathname) || url.startsWith(`${client.getClientState()?.endpoint}/`)
  }
  function measurements(span: SpanHandle, raw: string, started: number, w: Window) {
    if ((requestStarts.get(raw) ?? []).filter((time) => Math.abs(time - started) <= 110).length > 1) return true
    const entries = w.performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    const candidates = entries.filter((e) => e.name === raw && e.startTime >= started - 10 && e.startTime <= started + 100)
    if (candidates.length !== 1) return false
    const entry = candidates[0]
    resources.add(entry)
    // Zero restricted values are unknown. A visible requestStart is needed for cross-origin data.
    const sameOrigin = new URL(raw).origin === w.location.origin
    if (!sameOrigin && entry.requestStart === 0) return true
    span.setMeasurements({
      ...(entry.requestStart > 0 && entry.responseStart >= entry.requestStart ? { ttfbMs: entry.responseStart - entry.requestStart } : {}),
      transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize,
    })
    if (entry.responseEnd >= entry.responseStart && entry.responseStart > 0) span.setAttribute('http.download_duration', entry.responseEnd - entry.responseStart)
    return true
  }
  function http(input: string, method: string, instrumentation: string, w: Window) {
    if (excluded(input, w)) return undefined
    const { raw, route } = address(input, w)
    const started = w.performance.now()
    if (requestStarts.size >= 1000 && !requestStarts.has(raw)) requestStarts.delete(requestStarts.keys().next().value!)
    requestStarts.set(raw, [...(requestStarts.get(raw) ?? []).filter((time) => started - time < 60_000), started].slice(-200))
    const parent = root && !root.ended ? root : undefined
    const span = client.startInactiveSpan({ name: `${method} ${route}`, op: 'http.client', parent, attributes: { 'http.instrumentation': instrumentation } })
    span.setMeasurements({ httpMethod: method.slice(0, 16), httpRoute: route })
    pending++
    if (idle) clearTimeout(idle)
    let finished = false
    return {
      context: span.context,
      finish(status: 'ok' | 'error' | 'cancelled' | 'unknown', code?: number, reason = 'completed') {
        if (finished) return
        finished = true
        safe(() => {
          if (code && code >= 100 && code <= 599) span.setMeasurements({ httpStatusCode: code })
          span.end(status, reason)
          if (parent === root) pending = Math.max(0, pending - 1)
          const tryMeasure = (remaining: number) => {
            if (!measurements(span, raw, started, w) && remaining > 0) later(() => tryMeasure(remaining - 1), 100)
          }
          tryMeasure(9)
          scheduleIdle()
        })
      },
    }
  }

  function install(w: Window): void {
    if (windows.has(w)) return
    windows.add(w)
    const navigation = w.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    startNavigation(w.location.pathname, 'pageload', navigation?.startTime)
    if (w.document.readyState !== 'complete') {
      pending++
      w.addEventListener('load', () => { pending = Math.max(0, pending - 1); scheduleIdle() }, { once: true })
    }
    w.addEventListener('pagehide', () => endRoot('page_hidden'))
    w.document.addEventListener('visibilitychange', () => { if (w.document.visibilityState === 'hidden') endRoot('page_hidden') })

    // Retain the original method; the wrapper explicitly restores its call receiver.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalFetch = w.fetch
    if (typeof originalFetch === 'function') {
      w.fetch = function (input, init) {
        let operation: ReturnType<typeof http>
        let requestInit = init
        safe(() => {
          const request = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
          const method = init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')
          operation = http(request, method.toUpperCase(), 'fetch', w)
          const mode = init?.mode ?? (typeof input === 'object' && 'mode' in input ? input.mode : undefined)
          if (operation && mode !== 'no-cors' && matchesPropagationTarget(request, w.location.href, client.getPropagationTargets?.() ?? [])) {
            const headers = new Headers(init?.headers ?? (typeof input === 'object' && 'headers' in input ? input.headers : undefined))
            if (!headers.has('traceparent')) {
              headers.set('traceparent', traceparent(operation.context))
              requestInit = { ...init, headers }
            }
          }
        })
        let promise: Promise<Response>
        try { promise = originalFetch.call(this, input, requestInit) }
        catch (error) { operation?.finish('error'); throw error }
        void promise.then((response) => {
          safe(() => operation?.finish(response.status >= 400 ? 'error' : response.status === 0 ? 'unknown' : 'ok', response.status))
        }, (error: unknown) => {
          const abort = typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
          safe(() => operation?.finish(abort ? 'cancelled' : 'error', undefined, abort ? 'abort' : 'network_error'))
        }).catch(() => undefined)
        return promise
      }
    }

    const XHR = (w as unknown as { XMLHttpRequest?: typeof XMLHttpRequest }).XMLHttpRequest
    if (XHR) {
      const meta = new WeakMap<XMLHttpRequest, { url: string; method: string; hasTraceparent: boolean }>()
      // Both methods are invoked with the original XMLHttpRequest receiver below.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const open = XHR.prototype.open
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const send = XHR.prototype.send
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const setRequestHeader = XHR.prototype.setRequestHeader
      if (setRequestHeader) XHR.prototype.setRequestHeader = function (name, value) {
        const result = setRequestHeader.call(this, name, value)
        safe(() => { const m = meta.get(this); if (m && typeof name === 'string' && name.toLowerCase() === 'traceparent') m.hasTraceparent = true })
        return result
      }
      XHR.prototype.open = function (method: string, url: string | URL, async: boolean = true, username?: string | null, password?: string | null) {
        const result = open.call(this, method, url, async, username, password)
        safe(() => {
          if (typeof method === 'string' && (typeof url === 'string' || url instanceof URL)) meta.set(this, { url: typeof url === 'string' ? url : url.href, method: method.toUpperCase(), hasTraceparent: false })
          else meta.delete(this)
        })
        return result
      }
      XHR.prototype.send = function (body) {
        let operation: ReturnType<typeof http>
        safe(() => {
          const m = meta.get(this)
          if (m) {
            operation = http(m.url, m.method, 'xhr', w)
            if (operation && setRequestHeader && !m.hasTraceparent && matchesPropagationTarget(m.url, w.location.href, client.getPropagationTargets?.() ?? [])) {
              setRequestHeader.call(this, 'traceparent', traceparent(operation.context))
              m.hasTraceparent = true
            }
          }
        })
        const listeners: [string, EventListener][] = [
          ['load', () => operation?.finish(this.status >= 400 ? 'error' : this.status === 0 ? 'unknown' : 'ok', this.status)],
          ['error', () => operation?.finish('error', undefined, 'network_error')],
          ['timeout', () => operation?.finish('error', undefined, 'request_timeout')],
          ['abort', () => operation?.finish('cancelled', undefined, 'abort')],
        ]
        const remove = () => { listeners.forEach(([event, listener]) => this.removeEventListener(event, listener)); this.removeEventListener('loadend', remove) }
        listeners.forEach(([event, listener]) => this.addEventListener(event, listener))
        this.addEventListener('loadend', remove, { once: true })
        try { return send.call(this, body) } catch (error) { safe(() => operation?.finish('error')); remove(); throw error }
      }
    }
  }
  return { install, startNavigation, navigationReady, endNavigation: endRoot }
}

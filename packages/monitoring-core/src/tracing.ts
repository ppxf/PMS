import type { MonitoringInitOptions, Transport } from './types.js'
import type { MonitoringSpan, SpanHandle, SpanOptions, TraceContext, TransactionEnvelope } from './tracing-types.js'

const id = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (v) => v.toString(16).padStart(2, '0')).join('')
const now = () => performance.now()
const safeText = (value: string, max = 256) => value.slice(0, max)
const validContext = (c: TraceContext) => /^[a-f0-9]{32}$/.test(c.traceId) && !/^0+$/.test(c.traceId) && /^[a-f0-9]{16}$/.test(c.spanId) && !/^0+$/.test(c.spanId) && typeof c.sampled === 'boolean'

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

interface Recording { spans: SpanHandle[]; root: SpanHandle; sealed: boolean; graceDeadline?: number; timer?: ReturnType<typeof setTimeout> }
interface Pending { envelope: TransactionEnvelope; attempts: number; created: number; timer?: ReturnType<typeof setTimeout>; sending?: Promise<void> }

export function createTracing() {
  let rootObserver: { rootStarted(span: SpanHandle): void; rootEnded(span: SpanHandle): void } | undefined
  let config: MonitoringInitOptions | undefined
  let transport: Transport | undefined
  let droppedBatches = 0
  let activeSpan: SpanHandle | undefined
  let pageSpan: SpanHandle | undefined
  const recordings = new Set<Recording>()
  const parents = new WeakMap<SpanHandle, Recording>()
  const queue = new Set<Pending>()
  const clockTimers = new Set<ReturnType<typeof setTimeout>>()
  let errorContexts = new WeakMap<object, TraceContext>()

  function rememberError(error: unknown, span: SpanHandle): void {
    if ((typeof error === 'object' && error !== null) || typeof error === 'function') {
      // Preserve the innermost throwing span when the same error unwinds through parents.
      if (!errorContexts.has(error)) errorContexts.set(error, span.context)
    }
  }
  function getErrorTraceContext(error: unknown): TraceContext | undefined {
    const recorded = ((typeof error === 'object' && error !== null) || typeof error === 'function')
      ? errorContexts.get(error) : undefined
    return recorded ?? getLogTraceContext()
  }

  function currentSpan(): SpanHandle | undefined {
    const span = activeSpan && !activeSpan.ended ? activeSpan : pageSpan
    return span && !span.ended ? span : undefined
  }
  function getActiveTraceContext(): TraceContext | undefined {
    // A completed page trace remains the correlation context until navigation or page leave.
    // Keep currentSpan() strict so new spans never attach to an ended recording.
    const span = currentSpan() ?? pageSpan
    return span?.context.sampled && parents.get(span)?.spans.includes(span) ? span.context : undefined
  }
  function getLogTraceContext(): TraceContext | undefined { return (currentSpan() ?? pageSpan)?.context }
  function setPageSpan(span: SpanHandle | undefined): void { pageSpan = span }

  function configure(options: MonitoringInitOptions, sender: Transport): void {
    config = options
    transport = sender
  }

  function send(item: Pending): Promise<void> {
    if (item.sending) return item.sending
    if (item.timer) clearTimeout(item.timer)
    item.timer = undefined
    item.attempts++
    const sender = transport
    item.sending = Promise.resolve().then(async () => {
      try {
        if (!queue.has(item)) return
        await sender?.send(item.envelope)
        queue.delete(item)
      } catch (error) {
        if (!queue.has(item)) return
        const status = typeof error === 'object' && error !== null && 'status' in error ? (error as { status?: number }).status : undefined
        const transient = status === undefined || status === 429 || (status >= 500 && status <= 599)
        if (transient && item.attempts < 5 && Date.now() - item.created < 86_400_000) {
          item.timer = setTimeout(() => { void send(item) }, Math.min(1000 * 2 ** (item.attempts - 1), 30_000))
        } else { queue.delete(item); droppedBatches++ }
      } finally { item.sending = undefined }
    })
    return item.sending
  }

  function seal(recording: Recording): void {
    if (recording.sealed) return
    recording.sealed = true
    if (recording.timer) clearTimeout(recording.timer)
    const reason = recording.root.span.endReason
    for (const handle of recording.spans) {
      if (!handle.ended) handle.end(reason === 'deadline_exceeded' ? 'deadline_exceeded' : 'cancelled', reason === 'completed' ? 'parent_ended' : reason)
    }
    recordings.delete(recording)
    const spans = JSON.parse(JSON.stringify(recording.spans.map((h) => h.span))) as MonitoringSpan[]
    const envelope: TransactionEnvelope = { version: 1, type: 'transaction', sentAt: new Date().toISOString(), transaction: { eventId: crypto.randomUUID(), spans } }
    while (new TextEncoder().encode(JSON.stringify(envelope)).length > 262_144 && spans.length > 1) {
      spans.pop(); spans[0].droppedSpanCount++; spans[0].truncated = true
    }
    // Repeat the identical root in each chunk: ingestion deduplicates by Span ID and content.
    // This preserves ancestry and the existing transaction-root contract without dropping more spans.
    const chunks: TransactionEnvelope[] = []
    const makeChunk = (): TransactionEnvelope => ({ version: 1, type: 'transaction', sentAt: envelope.sentAt,
      transaction: { eventId: crypto.randomUUID(), spans: [spans[0]] } })
    let chunk = makeChunk()
    for (const span of spans.slice(1)) {
      chunk.transaction.spans.push(span)
      if (new TextEncoder().encode(JSON.stringify(chunk)).length > 55_000) {
        chunk.transaction.spans.pop()
        chunks.push(chunk)
        chunk = makeChunk()
        chunk.transaction.spans.push(span)
      }
    }
    chunks.push(chunk)
    if (queue.size + chunks.length > 100 || chunks.some(part => new TextEncoder().encode(JSON.stringify(part)).length > 60_000)) { droppedBatches++; return }
    for (const part of chunks) {
      const item: Pending = { envelope: freeze(part), attempts: 0, created: Date.now() }
      queue.add(item)
      void send(item)
    }
  }

  function startInactiveSpan(options: SpanOptions): SpanHandle {
    const parentHandle = options.parent && 'context' in options.parent ? options.parent : undefined
    const rawParent = parentHandle?.context ?? options.parent as TraceContext | undefined
    const parent = rawParent && validContext(rawParent) ? rawParent : undefined
    const existing = parentHandle ? parents.get(parentHandle) : undefined
    const recording = existing && !existing.sealed && !existing.root.ended ? existing : undefined
    const sampled = Boolean(config) && (parent?.sampled ?? Math.random() < (config?.tracesSampleRate ?? 0))
    const started = Number.isFinite(options.startTime) ? Math.max(0, Math.min(now(), options.startTime!)) : now()
    const timeOrigin = Number.isFinite(performance.timeOrigin) ? performance.timeOrigin : Date.now() - now()
    const span: MonitoringSpan = {
      traceId: parent?.traceId ?? id(16), spanId: id(8), ...(parent ? { parentSpanId: parent.spanId } : {}),
      isTransaction: !recording, name: safeText(options.name), op: safeText(options.op ?? 'business', 64),
      startTime: new Date(timeOrigin + started).toISOString(), endTime: new Date().toISOString(), durationMs: 0, status: 'unknown',
      ...(config?.environment ? { environment: safeText(config.environment, 128) } : {}),
      ...(config?.release ? { release: safeText(config.release, 128) } : {}),
      ...(options.pageRoute ? { pageRoute: safeText(options.pageRoute, 512) } : {}),
      truncated: false, endReason: 'completed', droppedSpanCount: 0, attributes: { 'pms.measurement.status': 'recording' },
    }
    let ended = false
    let owner: Recording | undefined = recording
    const handle: SpanHandle = {
      context: Object.freeze({ traceId: span.traceId, spanId: span.spanId, sampled }), span,
      get ended() { return ended },
      end(status = 'ok', reason = 'completed', endTime) {
        if (ended) return
        ended = true
        const finished = Number.isFinite(endTime) ? Math.max(started, Math.min(now(), endTime!)) : now()
        span.durationMs = Math.max(0, finished - started)
        span.endTime = new Date(timeOrigin + finished).toISOString()
        span.status = status; span.endReason = safeText(reason, 64)
        const lifecycle = ['navigation', 'page_hidden', 'page_left'].includes(reason) && ['pageload', 'navigation'].includes(span.op)
        span.attributes['pms.measurement.status'] = status === 'deadline_exceeded' ? 'timeout'
          : lifecycle ? 'lifecycle'
          : status === 'cancelled' && reason !== 'abort' || status === 'unknown' && reason !== 'completed' ? 'interrupted' : 'complete'
        if (owner?.root === handle && !owner.sealed) {
          rootObserver?.rootEnded(handle)
          const waiting = owner.spans.some(child => !child.ended)
          owner.graceDeadline = Date.now() + (waiting && status !== 'deadline_exceeded' ? 5000 : 1000)
          owner.timer = setTimeout(() => seal(owner!), waiting && status !== 'deadline_exceeded' ? 5000 : 1000)
        } else if (owner && owner.root.ended && !owner.sealed && owner.spans.every(child => child.ended)) {
          if (owner.timer) clearTimeout(owner.timer)
          owner.timer = setTimeout(() => seal(owner!), Math.max(0, Math.min(1000, (owner.graceDeadline ?? Date.now()) - Date.now())))
        }
      },
      setAttribute(key, value) {
        if (key === 'pms.measurement.status' || owner?.sealed || /authorization|cookie|token|password|secret|credential/i.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) return
        if (Object.keys(span.attributes).length >= 50 && !(key in span.attributes)) return
        if (typeof value === 'number' && !Number.isFinite(value)) return
        span.attributes[safeText(key, 64)] = typeof value === 'string' ? safeText(value) : value
      },
      setMeasurements(values) {
        if (owner?.sealed) return
        for (const [key, value] of Object.entries(values)) {
          if (!['ttfbMs', 'transferSize', 'encodedBodySize', 'decodedBodySize', 'httpMethod', 'httpRoute', 'httpStatusCode'].includes(key)) continue
          if (typeof value === 'number' && Number.isFinite(value) && value >= 0) Object.assign(span, { [key]: value })
          if (typeof value === 'string') Object.assign(span, { [key]: safeText(value, 512) })
        }
      },
    }
    if (sampled) {
      if (!owner) {
        owner = { spans: [handle], root: handle, sealed: false }
        recordings.add(owner)
        const timer = setTimeout(() => { clockTimers.delete(timer); handle.end('deadline_exceeded', 'deadline_exceeded') }, 30_000)
        clockTimers.add(timer)
      } else if (owner.spans.length < 200) owner.spans.push(handle)
      else { owner.root.span.droppedSpanCount++; owner.root.span.truncated = true }
      parents.set(handle, owner)
      if (owner.root === handle) rootObserver?.rootStarted(handle)
    }
    Object.entries(options.attributes ?? {}).forEach(([key, value]) => handle.setAttribute(key, value))
    return handle
  }

  function startSpan<T>(options: SpanOptions, callback: (span: SpanHandle) => T): T {
    const span = startInactiveSpan({ ...options, parent: options.parent ?? currentSpan() })
    const previous = activeSpan
    activeSpan = span
    let value: T
    try {
      value = callback(span)
    } catch (error) { rememberError(error, span); span.end('error'); throw error }
    finally { activeSpan = previous }
    try {
      if (value && typeof (value as unknown as PromiseLike<unknown>).then === 'function') {
        void Promise.resolve(value).then(() => span.end(), error => { rememberError(error, span); span.end('error') }).catch(() => undefined)
      } else span.end()
    } catch { span.end('unknown', 'observation_failed') }
    return value
  }

  function endPageSession(): void {
    for (const recording of [...recordings]) {
      if (!recording.root.ended) recording.root.end('cancelled', 'page_left')
      seal(recording)
    }
    pageSpan = undefined
  }
  async function flush(endPendingSpans = true): Promise<void> {
    for (const recording of recordings) if (recording.root.ended && (endPendingSpans || recording.spans.every(child => child.ended))) seal(recording)
    await Promise.all([...queue].map((item) => item.sending ?? send(item)))
  }
  function reset(): void {
    errorContexts = new WeakMap()
    activeSpan = undefined; pageSpan = undefined
    for (const recording of recordings) if (recording.timer) clearTimeout(recording.timer)
    clockTimers.forEach(clearTimeout); clockTimers.clear()
    for (const item of queue) if (item.timer) clearTimeout(item.timer)
    queue.clear(); recordings.clear(); config = undefined; transport = undefined; droppedBatches = 0
  }
  return { configure, setRootSpanObserver: (observer: typeof rootObserver) => { rootObserver = observer }, startInactiveSpan, startSpan, endPageSession, getActiveTraceContext, getLogTraceContext, getErrorTraceContext, setPageSpan, flush, reset, getTraceStats: () => ({ queuedBatches: queue.size, droppedBatches }) }
}

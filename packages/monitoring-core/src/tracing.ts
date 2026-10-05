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

interface Recording { spans: SpanHandle[]; root: SpanHandle; sealed: boolean; timer?: ReturnType<typeof setTimeout> }
interface Pending { envelope: TransactionEnvelope; attempts: number; created: number; timer?: ReturnType<typeof setTimeout>; sending?: Promise<void> }

export function createTracing() {
  let config: MonitoringInitOptions | undefined
  let transport: Transport | undefined
  let droppedBatches = 0
  const recordings = new Set<Recording>()
  const parents = new WeakMap<SpanHandle, Recording>()
  const queue = new Set<Pending>()
  const clockTimers = new Set<ReturnType<typeof setTimeout>>()

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
      if (!handle.ended) handle.end(reason === 'deadline_exceeded' ? 'deadline_exceeded' : 'unknown', reason === 'completed' ? 'parent_ended' : reason)
    }
    recordings.delete(recording)
    const spans = JSON.parse(JSON.stringify(recording.spans.map((h) => h.span))) as MonitoringSpan[]
    const envelope: TransactionEnvelope = { version: 1, type: 'transaction', sentAt: new Date().toISOString(), transaction: { eventId: crypto.randomUUID(), spans } }
    while (new TextEncoder().encode(JSON.stringify(envelope)).length > 262_144 && spans.length > 1) {
      spans.pop(); spans[0].droppedSpanCount++; spans[0].truncated = true
    }
    if (queue.size >= 100 || new TextEncoder().encode(JSON.stringify(envelope)).length > 262_144) { droppedBatches++; return }
    const item: Pending = { envelope: freeze(envelope), attempts: 0, created: Date.now() }
    queue.add(item)
    void send(item)
  }

  function startInactiveSpan(options: SpanOptions): SpanHandle {
    const parentHandle = options.parent && 'context' in options.parent ? options.parent : undefined
    const rawParent = parentHandle?.context ?? options.parent as TraceContext | undefined
    const parent = rawParent && validContext(rawParent) ? rawParent : undefined
    const existing = parentHandle ? parents.get(parentHandle) : undefined
    const recording = existing && !existing.sealed && !existing.root.ended ? existing : undefined
    const sampled = Boolean(config) && (parent?.sampled ?? Math.random() < (config?.tracesSampleRate ?? 0))
    const started = Number.isFinite(options.startTime) ? Math.max(0, Math.min(now(), options.startTime!)) : now()
    const span: MonitoringSpan = {
      traceId: parent?.traceId ?? id(16), spanId: id(8), ...(parent ? { parentSpanId: parent.spanId } : {}),
      isTransaction: !recording, name: safeText(options.name), op: safeText(options.op ?? 'business', 64),
      startTime: new Date(Date.now() - (now() - started)).toISOString(), endTime: new Date().toISOString(), durationMs: 0, status: 'unknown',
      ...(config?.environment ? { environment: safeText(config.environment, 128) } : {}),
      ...(config?.release ? { release: safeText(config.release, 128) } : {}),
      ...(options.pageRoute ? { pageRoute: safeText(options.pageRoute, 512) } : {}),
      truncated: false, endReason: 'completed', droppedSpanCount: 0, attributes: {},
    }
    let ended = false
    let owner: Recording | undefined = recording
    const handle: SpanHandle = {
      context: Object.freeze({ traceId: span.traceId, spanId: span.spanId, sampled }), span,
      get ended() { return ended },
      end(status = 'ok', reason = 'completed') {
        if (ended) return
        ended = true
        span.durationMs = Math.max(0, now() - started)
        span.endTime = new Date(Date.parse(span.startTime) + span.durationMs).toISOString()
        span.status = status; span.endReason = safeText(reason, 64)
        span.truncated ||= status === 'deadline_exceeded' || (status === 'unknown' && reason !== 'completed')
        if (owner?.root === handle && !owner.sealed) {
          owner.timer = setTimeout(() => seal(owner!), 1000)
        }
      },
      setAttribute(key, value) {
        if (owner?.sealed || /authorization|cookie|token|password|secret|credential/i.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) return
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
    }
    Object.entries(options.attributes ?? {}).forEach(([key, value]) => handle.setAttribute(key, value))
    return handle
  }

  function startSpan<T>(options: SpanOptions, callback: (span: SpanHandle) => T): T {
    const span = startInactiveSpan(options)
    let value: T
    try {
      value = callback(span)
    } catch (error) { span.end('error'); throw error }
    try {
      if (value && typeof (value as unknown as PromiseLike<unknown>).then === 'function') {
        void Promise.resolve(value).then(() => span.end(), () => span.end('error')).catch(() => undefined)
      } else span.end()
    } catch { span.end('unknown', 'observation_failed') }
    return value
  }

  async function flush(): Promise<void> {
    for (const recording of recordings) if (recording.root.ended) seal(recording)
    await Promise.all([...queue].map((item) => item.sending ?? send(item)))
  }
  function reset(): void {
    for (const recording of recordings) if (recording.timer) clearTimeout(recording.timer)
    clockTimers.forEach(clearTimeout); clockTimers.clear()
    for (const item of queue) if (item.timer) clearTimeout(item.timer)
    queue.clear(); recordings.clear(); config = undefined; transport = undefined; droppedBatches = 0
  }
  return { configure, startInactiveSpan, startSpan, flush, reset, getTraceStats: () => ({ queuedBatches: queue.size, droppedBatches }) }
}

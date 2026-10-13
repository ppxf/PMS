import type { MonitoringInitOptions, Transport } from './types.js'
import type { MetricOptions, MetricSample, MetricsEnvelope, MetricType } from './metrics-types.js'

export function createMetrics() {
  let config: MonitoringInitOptions | undefined
  let transport: Transport | undefined
  let buffer: MetricSample[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let droppedSamples = 0
  const queue = new Set<{ envelope: MetricsEnvelope; attempts: number; sending?: Promise<void>; timer?: ReturnType<typeof setTimeout> }>()

  function schedule() {
    if (!timer && buffer.length) timer = setTimeout(() => { timer = undefined; seal() }, 5000)
  }
  function seal() {
    if (timer) clearTimeout(timer)
    timer = undefined
    if (!buffer.length) return
    const samples = buffer
    buffer = []
    if (queue.size >= 10) { droppedSamples += samples.length; return }
    const item = { envelope: { version: 1, type: 'metrics', sentAt: new Date().toISOString(), eventId: crypto.randomUUID(), samples } as MetricsEnvelope, attempts: 0 }
    queue.add(item)
    void send(item)
  }
  function send(item: { envelope: MetricsEnvelope; attempts: number; sending?: Promise<void>; timer?: ReturnType<typeof setTimeout> }): Promise<void> {
    if (item.sending) return item.sending
    if (item.timer) clearTimeout(item.timer)
    item.timer = undefined
    const sender = transport
    item.attempts++
    item.sending = Promise.resolve().then(async () => {
      if (!queue.has(item)) return
      try { await sender?.send(item.envelope); queue.delete(item) }
      catch (error) {
        if (!queue.has(item)) return
        const status = error && typeof error === 'object' && 'status' in error ? (error as { status?: number }).status : undefined
        if ((status === undefined || status === 429 || status >= 500 && status <= 599) && item.attempts < 3) {
          item.timer = setTimeout(() => { void send(item) }, 1000 * 2 ** (item.attempts - 1))
        } else { queue.delete(item); droppedSamples += item.envelope.samples.length }
        try { void Promise.resolve(config?.onTransportError?.(error, item.envelope)).catch(() => undefined) } catch { /* Reporting must not affect the application. */ }
      } finally { item.sending = undefined }
    })
    return item.sending
  }
  function record(type: MetricType, name: string, value: number, options: MetricOptions = {}) {
    if (!config?.enableMetrics) return
    const attributes = options.attributes ?? {}
    const unit = options.unit ?? 'none'
    const context = options.traceContext
    const invalid = typeof name !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_./-]{0,127}$/.test(name) ||
      !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER || (type === 'count' && value < 0) ||
      typeof unit !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_./-]{0,31}$/.test(unit) ||
      typeof attributes !== 'object' || Array.isArray(attributes) ||
      Object.keys(attributes).length > 20 || Object.entries(attributes).some(([key, v]) =>
        !key.length || key.length > 64 || ['__proto__', 'prototype', 'constructor'].includes(key) ||
        !(typeof v === 'string' && v.length <= 256 || typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER)) ||
      (context && (!/^[a-f0-9]{32}$/.test(context.traceId) || /^0+$/.test(context.traceId) || !/^[a-f0-9]{16}$/.test(context.spanId) || /^0+$/.test(context.spanId)))
    if (invalid) { droppedSamples++; return }
    const sample: MetricSample = {
      name, type, value, unit, timestamp: new Date().toISOString(), attributes: { ...attributes },
      ...(config.environment ? { environment: config.environment.slice(0, 128) } : {}),
      ...(config.release ? { release: config.release.slice(0, 128) } : {}),
      ...(context ? { traceId: context.traceId, spanId: context.spanId } : {}),
    }
    if (new TextEncoder().encode(JSON.stringify(sample)).length > 2000) { droppedSamples++; return }
    buffer.push(sample)
    if (buffer.length >= 100) seal()
    else schedule()
  }
  return {
    configure(options: MonitoringInitOptions, sender: Transport) { config = options; transport = sender },
    metrics: {
      count: (name: string, value = 1, options?: MetricOptions) => record('count', name, value, options),
      gauge: (name: string, value: number, options?: MetricOptions) => record('gauge', name, value, options),
      distribution: (name: string, value: number, options?: MetricOptions) => record('distribution', name, value, options),
    },
    async flush() { seal(); await Promise.all([...queue].map(item => send(item))) },
    getMetricStats: () => ({ bufferedSamples: buffer.length, queuedBatches: queue.size, droppedSamples }),
    reset() {
      if (timer) clearTimeout(timer)
      queue.forEach(item => { if (item.timer) clearTimeout(item.timer) })
      queue.clear(); buffer = []; timer = undefined; config = undefined; transport = undefined; droppedSamples = 0
    },
  }
}

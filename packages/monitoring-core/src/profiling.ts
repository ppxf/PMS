import type { MonitoringInitOptions, Transport } from './types.js'
import type {
  MonitoringProfile,
  ProfileEnvelope,
  ProfileDiagnosticEnvelope,
  ProfileStartOptions,
} from './profiling-types.js'
import type { SpanHandle } from './tracing-types.js'

interface NativeTrace {
  resources: string[]
  frames: {
    name: string
    resourceId?: number
    line?: number
    column?: number
  }[]
  stacks: { frameId: number; parentId?: number }[]
  samples: { timestamp: number; stackId?: number }[]
}
interface NativeProfiler {
  sampleInterval: number
  stop(): Promise<NativeTrace>
  addEventListener?(name: string, callback: () => void): void
}
interface Recording {
  profiler: NativeProfiler
  started: number
  date: string
  options: ProfileStartOptions
  timer: ReturnType<typeof setTimeout>
  generation: number
}
interface Pending {
  envelope: ProfileEnvelope
  attempts: number
  timer?: ReturnType<typeof setTimeout>
  sending?: Promise<void>
}
interface StartRequest {
  options: ProfileStartOptions
  lifecycle: 'manual' | 'trace'
}
const MAX_BYTES = 262144
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}
const index = (value: unknown, length: number): value is number =>
  Number.isInteger(value) &&
  (value as number) >= 0 &&
  (value as number) < length

export function createProfiling() {
  let config: MonitoringInitOptions | undefined
  let transport: Transport | undefined
  let enabled = false
  let sampled = false
  let generation = 0
  let recording: Recording | undefined
  let stopping: Promise<void> | undefined
  let requested: StartRequest | undefined
  let startFailed = false
  let diagnostic: Promise<void> | undefined
  const roots = new Set<SpanHandle>()
  const queue = new Set<Pending>()

  function configure(options: MonitoringInitOptions, sender: Transport): void {
    config = options
    transport = sender
    const rate = options.profileSessionSampleRate ?? 0
    sampled = rate === 1 || (rate > 0 && Math.random() < rate)
  }
  function send(item: Pending): Promise<void> {
    if (item.sending) return item.sending
    if (item.timer) clearTimeout(item.timer)
    item.timer = undefined
    item.attempts++
    const sender = transport
    item.sending = Promise.resolve().then(async () => {
      try {
        if (queue.has(item)) {
          await sender?.send(item.envelope)
          queue.delete(item)
        }
      } catch (error) {
        if (!queue.has(item)) return
        const status =
          typeof error === 'object' && error !== null && 'status' in error
            ? (error as { status?: number }).status
            : undefined
        if (
          (status === undefined ||
            status === 429 ||
            (status >= 500 && status <= 599)) &&
          item.attempts < 5
        ) {
          item.timer = setTimeout(
            () => {
              void send(item)
            },
            1000 * 2 ** (item.attempts - 1),
          )
        } else queue.delete(item)
      } finally {
        item.sending = undefined
      }
    })
    return item.sending
  }
  function normalize(
    trace: NativeTrace,
    active: Recording,
    duration: number,
    truncated: boolean,
  ): MonitoringProfile {
    const resources = trace.resources
      .slice(0, 2000)
      .map((resource) => resource.slice(0, 2048))
    const frames = trace.frames.slice(0, 2000).map((frame) => ({
      name: frame.name.slice(0, 256),
      ...(index(frame.resourceId, resources.length)
        ? { resourceId: frame.resourceId }
        : {}),
      ...(Number.isInteger(frame.line) && frame.line! >= 0
        ? { line: frame.line }
        : {}),
      ...(Number.isInteger(frame.column) && frame.column! >= 0
        ? { column: frame.column }
        : {}),
    }))
    const stackMap = new Map<number, number>()
    const depths: number[] = []
    const stacks: MonitoringProfile['stacks'] = []
    trace.stacks.slice(0, 5000).forEach((stack, originalIndex) => {
      if (!index(stack.frameId, frames.length)) {
        truncated = true
        return
      }
      const parentId = index(stack.parentId, originalIndex)
        ? stackMap.get(stack.parentId)
        : undefined
      const depth = parentId === undefined ? 1 : depths[parentId] + 1
      if (depth > 128) {
        truncated = true
        return
      }
      if (stack.parentId !== undefined && parentId === undefined)
        truncated = true
      stackMap.set(originalIndex, stacks.length)
      depths.push(depth)
      stacks.push({
        frameId: stack.frameId,
        ...(parentId === undefined ? {} : { parentId }),
      })
    })
    let previous = -1
    const samples: MonitoringProfile['samples'] = []
    for (const sample of trace.samples.slice(0, 10000)) {
      const timestamp = sample.timestamp - active.started
      if (
        !Number.isFinite(timestamp) ||
        timestamp < 0 ||
        timestamp < previous ||
        timestamp > duration
      ) {
        truncated = true
        continue
      }
      previous = timestamp
      const stackId =
        sample.stackId === undefined ? undefined : stackMap.get(sample.stackId)
      if (sample.stackId !== undefined && stackId === undefined)
        truncated = true
      samples.push({
        timestamp,
        ...(stackId === undefined ? {} : { stackId }),
      })
    }
    truncated ||=
      trace.frames.length > 2000 ||
      trace.stacks.length > 5000 ||
      trace.samples.length >= 10000 ||
      trace.resources.length > 2000
    return {
      profileId: globalThis.crypto.randomUUID(),
      startedAt: active.date,
      durationMs: duration,
      sampleIntervalMs:
        Number.isFinite(active.profiler.sampleInterval) &&
        active.profiler.sampleInterval > 0
          ? active.profiler.sampleInterval
          : 10,
      name: (active.options.name || 'UI profile').slice(0, 256),
      ...(config?.environment
        ? { environment: config.environment.slice(0, 128) }
        : {}),
      ...(config?.release ? { release: config.release.slice(0, 128) } : {}),
      ...(active.options.traceId &&
      /^[a-f0-9]{32}$/.test(active.options.traceId) &&
      !/^0+$/.test(active.options.traceId)
        ? { traceId: active.options.traceId }
        : {}),
      ...(active.options.spanId &&
      /^[a-f0-9]{16}$/.test(active.options.spanId) &&
      !/^0+$/.test(active.options.spanId)
        ? { spanId: active.options.spanId }
        : {}),
      truncated,
      resources,
      frames,
      stacks,
      samples,
    }
  }
  function startProfiler(
    options: ProfileStartOptions = {},
    lifecycle: StartRequest['lifecycle'] = 'manual',
  ): void {
    if (!enabled || !sampled || recording || startFailed) return
    if (stopping) {
      requested ??= { options: { ...options }, lifecycle }
      return
    }
    const Profiler = (
      globalThis as typeof globalThis & {
        Profiler?: new (options: {
          sampleInterval: number
          maxBufferSize: number
        }) => NativeProfiler
      }
    ).Profiler
    if (!Profiler) return
    try {
      const started = performance.now(),
        date = new Date().toISOString()
      const profiler = new Profiler({
        sampleInterval: 10,
        maxBufferSize: 10000,
      })
      const active: Recording = {
        profiler,
        started,
        date,
        options: { ...options },
        generation,
        timer: setTimeout(() => {
          void stop(true)
        }, 30000),
      }
      recording = active
      profiler.addEventListener?.('samplebufferfull', () => {
        if (recording === active) void stop(true)
      })
    } catch (error) {
      startFailed = true
      const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined
      const envelope: ProfileDiagnosticEnvelope = {
        version: 1,
        type: 'profile_diagnostic',
        sentAt: new Date().toISOString(),
        reason: name === 'NotAllowedError' || name === 'SecurityError' ? 'permission_denied' : 'start_failed',
      }
      const sender = transport
      const current = generation
      // Report once per SDK lifecycle. Diagnostic errors must not break the app or retry forever.
      diagnostic = Promise.resolve().then(() => current === generation ? sender?.send(envelope) : undefined).catch(() => undefined)
    }
  }
  function stop(truncated = false): Promise<void> {
    requested = undefined
    const active = recording
    if (!active) return stopping ?? Promise.resolve()
    recording = undefined
    clearTimeout(active.timer)
    let stopped: Promise<NativeTrace>
    try {
      stopped = active.profiler.stop()
    } catch {
      return Promise.resolve()
    }
    // Stopping itself can produce a final native sample; include that synchronous
    // work while excluding the asynchronous trace serialization/upload wait.
    const duration = Math.min(
      30000,
      Math.max(0, performance.now() - active.started),
    )
    stopping = Promise.resolve(stopped)
      .then((trace) => {
        if (active.generation !== generation) return
        const profile = normalize(trace, active, duration, truncated)
        const envelope: ProfileEnvelope = {
          version: 1,
          type: 'profile',
          sentAt: new Date().toISOString(),
          profile,
        }
        if (
          new TextEncoder().encode(JSON.stringify(envelope)).length >
            MAX_BYTES ||
          queue.size >= 20
        )
          return
        const item: Pending = { envelope: freeze(envelope), attempts: 0 }
        queue.add(item)
        void send(item)
      })
      .catch(() => undefined)
      .finally(() => {
        if (active.generation !== generation) return
        stopping = undefined
        const next = requested
        requested = undefined
        if (next?.lifecycle === 'trace') {
          const first = roots.values().next().value
          if (first) startForRoot(first)
        } else if (next) startProfiler(next.options)
      })
    return stopping
  }
  function rootStarted(span: SpanHandle): void {
    if (config?.profileLifecycle !== 'trace' || !sampled) return
    roots.add(span)
    if (roots.size === 1) startForRoot(span)
  }
  function startForRoot(span: SpanHandle): void {
    startProfiler(
      {
        name: span.span.name,
        traceId: span.context.traceId,
        spanId: span.context.spanId,
      },
      'trace',
    )
  }
  function rootEnded(span: SpanHandle): void {
    if (roots.delete(span) && roots.size === 0) void stop()
  }
  async function flush(): Promise<void> {
    await diagnostic
    await stopping
    await Promise.all([...queue].map((item) => item.sending ?? send(item)))
  }
  function reset(): void {
    generation++
    requested = undefined
    const active = recording
    recording = undefined
    if (active) {
      clearTimeout(active.timer)
      void Promise.resolve()
        .then(() => active.profiler.stop())
        .catch(() => undefined)
    }
    stopping = undefined
    for (const item of queue) if (item.timer) clearTimeout(item.timer)
    queue.clear()
    roots.clear()
    enabled = false
    sampled = false
    startFailed = false
    diagnostic = undefined
    config = undefined
    transport = undefined
  }
  function enable(): void {
    if (enabled) return
    enabled = true
    const first = roots.values().next().value
    if (first) startForRoot(first)
  }
  return {
    configure,
    enable,
    rootStarted,
    rootEnded,
    flush,
    reset,
    uiProfiler: {
      startProfiler: (options?: ProfileStartOptions) => startProfiler(options),
      stopProfiler: () => stop(),
    },
  }
}

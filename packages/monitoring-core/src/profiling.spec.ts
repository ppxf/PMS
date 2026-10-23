import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMonitoringClient } from './client.js'
import type { MonitoringEnvelope } from './types.js'
import type {
  ProfileFrame,
  ProfileStack,
  ProfileSample,
} from './profiling-types.js'

const dsn = 'https://key@monitor.example.com/api/sdk/project'
let instances: FakeProfiler[] = []
class FakeProfiler extends EventTarget {
  sampleInterval = 10
  started = performance.now()
  stopped = false
  bufferEnded = false
  stopResult?: Promise<ReturnType<FakeProfiler['trace']>>
  constructor(
    readonly options: { sampleInterval: number; maxBufferSize: number },
  ) {
    super()
    instances.push(this)
  }
  trace(): {
    resources: string[]
    frames: ProfileFrame[]
    stacks: ProfileStack[]
    samples: ProfileSample[]
  } {
    return {
      resources: ['https://app.test/app.js'],
      frames: [{ name: 'work', resourceId: 0, line: 2, column: 3 }],
      stacks: [{ frameId: 0 }],
      samples: [
        { timestamp: this.started, stackId: 0 },
        { timestamp: this.started + 10 },
      ],
    }
  }
  stop() {
    this.stopped = true
    return this.bufferEnded
      ? Promise.reject(new Error('InvalidStateError'))
      : (this.stopResult ?? Promise.resolve(this.trace()))
  }
  overflow() {
    this.dispatchEvent(new Event('samplebufferfull'))
    this.bufferEnded = true
  }
}
const clients: ReturnType<typeof createMonitoringClient>[] = []
function setup(options = {}) {
  const envelopes: MonitoringEnvelope[] = []
  const client = createMonitoringClient()
  clients.push(client)
  client.init({
    dsn,
    profileSessionSampleRate: 1,
    transport: {
      send: (e) => {
        envelopes.push(e)
        return Promise.resolve()
      },
    },
    ...options,
  })
  client.enableProfiling()
  return {
    client,
    envelopes,
    profiles: () => envelopes.filter((e) => e.type === 'profile'),
  }
}
beforeEach(() => {
  vi.useFakeTimers()
  instances = []
  vi.stubGlobal('Profiler', FakeProfiler)
})
afterEach(() => {
  clients.forEach((c) => c.resetClientForTests())
  clients.length = 0
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('browser profiles', () => {
  it('includes samples produced by the synchronous native stop without marking a normal recording truncated', async () => {
    const { client, profiles } = setup()
    client.uiProfiler.startProfiler()
    const native = instances[0]
    vi.spyOn(native, 'stop').mockImplementation(() => {
      vi.advanceTimersByTime(3)
      return Promise.resolve({
        resources: [],
        frames: [],
        stacks: [],
        samples: [{ timestamp: native.started + 22 }],
      })
    })
    await vi.advanceTimersByTimeAsync(20)
    await client.uiProfiler.stopProfiler()
    await client.flush()
    expect(profiles()[0].profile).toMatchObject({
      durationMs: 23,
      truncated: false,
      samples: [{ timestamp: 22 }],
    })
  })
  it('still caps stop overhead at thirty seconds and rejects samples beyond that deadline', async () => {
    const { client, profiles } = setup()
    client.uiProfiler.startProfiler()
    const native = instances[0]
    vi.spyOn(native, 'stop').mockImplementation(() => {
      vi.advanceTimersByTime(3)
      return Promise.resolve({
        resources: [],
        frames: [],
        stacks: [],
        samples: [{ timestamp: native.started + 30001 }],
      })
    })
    await vi.advanceTimersByTimeAsync(29999)
    await client.uiProfiler.stopProfiler()
    await client.flush()
    expect(profiles()[0].profile).toMatchObject({
      durationMs: 30000,
      truncated: true,
      samples: [],
    })
  })
  it('stops synchronously during the native buffer-full event before the browser ends the session', async () => {
    const { client, profiles } = setup()
    client.uiProfiler.startProfiler()
    instances[0].overflow()
    await client.flush()
    expect(profiles()).toHaveLength(1)
    expect(profiles()[0].profile.truncated).toBe(true)
  })
  it('marks missing stack references truncated and omits invalid all-zero trace identifiers', async () => {
    const { client, profiles } = setup()
    client.uiProfiler.startProfiler({
      traceId: '0'.repeat(32),
      spanId: '0'.repeat(16),
    })
    instances[0].stopResult = Promise.resolve({
      resources: [],
      frames: [],
      stacks: [],
      samples: [{ timestamp: instances[0].started, stackId: 99 }],
    })
    await client.uiProfiler.stopProfiler()
    await client.flush()
    expect(profiles()[0].profile).toMatchObject({
      truncated: true,
      samples: [{ timestamp: 0 }],
    })
    expect(profiles()[0].profile.traceId).toBeUndefined()
    expect(profiles()[0].profile.spanId).toBeUndefined()
  })
  it('rejects invalid sampling options without initializing the client', () => {
    const client = createMonitoringClient()
    for (const rate of [-1, 2, NaN, Infinity])
      expect(() =>
        client.init({ dsn, profileSessionSampleRate: rate }),
      ).toThrow(TypeError)
    expect(client.getClientState()).toBeUndefined()
  })
  it('does not resample on identical init or multiple recordings', async () => {
    const random = vi
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.3)
      .mockReturnValue(0.9)
    const client = createMonitoringClient()
    clients.push(client)
    const envelopes: MonitoringEnvelope[] = []
    const options = {
      dsn,
      profileSessionSampleRate: 0.5,
      transport: {
        send: (e: MonitoringEnvelope) => {
          envelopes.push(e)
          return Promise.resolve()
        },
      },
    }
    client.init(options)
    client.enableProfiling()
    client.init(options)
    for (let i = 0; i < 2; i++) {
      client.uiProfiler.startProfiler()
      await client.uiProfiler.stopProfiler()
    }
    expect(envelopes.filter((e) => e.type === 'profile')).toHaveLength(2)
    expect(random).toHaveBeenCalledTimes(1)
    random.mockRestore()
  })
  it('prunes invalid table references and clamps all samples to the recording interval', async () => {
    const { client, profiles } = setup()
    client.uiProfiler.startProfiler()
    const started = instances[0].started
    instances[0].stopResult = Promise.resolve({
      resources: ['app.js'],
      frames: [
        { name: 'valid', resourceId: 0 },
        { name: 'bad-resource', resourceId: 99 },
      ],
      stacks: [{ frameId: 99 }, { frameId: 0 }, { frameId: 1, parentId: 1 }],
      samples: [
        { timestamp: started - 1, stackId: 0 },
        { timestamp: started, stackId: 1 },
        { timestamp: started + 10, stackId: 2 },
        { timestamp: started + 5, stackId: 1 },
        { timestamp: started + 30, stackId: 1 },
      ],
    })
    await vi.advanceTimersByTimeAsync(20)
    await client.uiProfiler.stopProfiler()
    await client.flush()
    expect(profiles()[0].profile).toMatchObject({
      truncated: true,
      frames: [{ name: 'valid', resourceId: 0 }, { name: 'bad-resource' }],
      stacks: [{ frameId: 0 }, { frameId: 1, parentId: 0 }],
      samples: [
        { timestamp: 0, stackId: 0 },
        { timestamp: 10, stackId: 1 },
      ],
    })
    expect(profiles()[0].profile.frames[1].resourceId).toBeUndefined()
  })
  it('drops envelopes over 256 KiB rather than sending invalid oversized profiles', async () => {
    const { client, profiles } = setup()
    client.uiProfiler.startProfiler()
    instances[0].stopResult = Promise.resolve({
      resources: Array.from({ length: 2000 }, () => 'x'.repeat(2048)),
      frames: [],
      stacks: [],
      samples: [],
    })
    await client.uiProfiler.stopProfiler()
    await client.flush()
    expect(profiles()).toHaveLength(0)
  })
  it('caps transient retries', async () => {
    let attempts = 0
    const { client } = setup({
      transport: {
        send: async (e: MonitoringEnvelope) => {
          await Promise.resolve()
          if (e.type === 'profile') {
            attempts++
            throw new Error('offline')
          }
        },
      },
    })
    client.uiProfiler.startProfiler()
    await client.uiProfiler.stopProfiler()
    for (let i = 0; i < 8; i++) await client.flush()
    expect(attempts).toBe(5)
    await vi.advanceTimersByTimeAsync(60000)
    expect(attempts).toBe(5)
  })
  it('does not retry permanent transport failures', async () => {
    let attempts = 0
    const { client } = setup({
      transport: {
        send: async (e: MonitoringEnvelope) => {
          await Promise.resolve()
          if (e.type === 'profile') {
            attempts++
            throw Object.assign(new Error('disabled'), { status: 403 })
          }
        },
      },
    })
    client.uiProfiler.startProfiler()
    await client.uiProfiler.stopProfiler()
    for (let i = 0; i < 3; i++) await client.flush()
    expect(attempts).toBe(1)
  })
  it('bounds native tables and stack depth', async () => {
    const { client, profiles } = setup()
    client.uiProfiler.startProfiler()
    instances[0].stopResult = Promise.resolve({
      resources: [],
      frames: Array.from({ length: 2001 }, () => ({ name: 'f' })),
      stacks: Array.from({ length: 5001 }, (_, i) => ({
        frameId: 0,
        ...(i ? { parentId: i - 1 } : {}),
      })),
      samples: [{ timestamp: instances[0].started, stackId: 127 }],
    })
    await client.uiProfiler.stopProfiler()
    await client.flush()
    const profile = profiles()[0].profile
    expect(profile.truncated).toBe(true)
    expect(profile.frames).toHaveLength(2000)
    expect(profile.stacks.length).toBeLessThanOrEqual(5000)
    const depths: number[] = []
    for (const stack of profile.stacks)
      depths.push(stack.parentId === undefined ? 1 : depths[stack.parentId] + 1)
    expect(Math.max(...depths)).toBe(128)
  })
  it('bounds samples at ten thousand and marks truncation', async () => {
    const { client, profiles } = setup()
    client.uiProfiler.startProfiler()
    instances[0].stopResult = Promise.resolve({
      resources: [],
      frames: [],
      stacks: [],
      samples: Array.from({ length: 10001 }, () => ({
        timestamp: instances[0].started,
      })),
    })
    await client.uiProfiler.stopProfiler()
    await client.flush()
    expect(profiles()[0].profile.samples).toHaveLength(10000)
    expect(profiles()[0].profile.truncated).toBe(true)
  })
  it('skips unsampled traces and keeps manual mode independent of roots', async () => {
    const { client, profiles } = setup({
      profileLifecycle: 'trace',
      tracesSampleRate: 0,
    })
    client.startInactiveSpan({ name: 'unsampled' }).end()
    await client.flush()
    expect(instances).toHaveLength(0)
    expect(profiles()).toHaveLength(0)
  })
  it('does not create a stale recording if a queued root ends during native stop', async () => {
    const { client, profiles } = setup({
      profileLifecycle: 'trace',
      tracesSampleRate: 1,
    })
    const first = client.startInactiveSpan({ name: 'first' })
    let resolve!: (value: ReturnType<FakeProfiler['trace']>) => void
    instances[0].stopResult = new Promise((r) => {
      resolve = r
    })
    first.end()
    const second = client.startInactiveSpan({ name: 'already ended' })
    second.end()
    resolve(instances[0].trace())
    await client.flush()
    expect(instances).toHaveLength(1)
    expect(profiles()).toHaveLength(1)
  })
  it('safely recovers from a rejected native stop', async () => {
    const { client, profiles } = setup()
    client.uiProfiler.startProfiler()
    instances[0].stopResult = Promise.reject(new Error('native failed'))
    await client.uiProfiler.stopProfiler()
    await client.flush()
    client.uiProfiler.startProfiler()
    await client.uiProfiler.stopProfiler()
    await client.flush()
    expect(profiles()).toHaveLength(1)
  })
  it('keeps the failed upload queue bounded at twenty profiles', async () => {
    let sent = 0
    const { client } = setup({
      transport: {
        send: (e: MonitoringEnvelope) => {
          if (e.type !== 'profile') return Promise.resolve()
          sent++
          return new Promise<void>(() => undefined)
        },
      },
    })
    for (let i = 0; i < 25; i++) {
      client.uiProfiler.startProfiler()
      await client.uiProfiler.stopProfiler()
    }
    expect(sent).toBe(20)
  })
  it('records manual profiles with relative timestamps and immutable envelopes', async () => {
    const { client, profiles } = setup({ environment: 'test', release: 'v1' })
    client.uiProfiler.startProfiler({ name: 'checkout' })
    await vi.advanceTimersByTimeAsync(20)
    await client.uiProfiler.stopProfiler()
    await client.flush()
    expect(profiles()).toHaveLength(1)
    expect(profiles()[0]).toMatchObject({
      version: 1,
      profile: {
        name: 'checkout',
        environment: 'test',
        release: 'v1',
        durationMs: 20,
        sampleIntervalMs: 10,
        truncated: false,
        samples: [{ timestamp: 0, stackId: 0 }, { timestamp: 10 }],
        frames: [{ name: 'work', resourceId: 0, line: 2, column: 3 }],
      },
    })
    expect(Object.isFrozen(profiles()[0].profile.samples)).toBe(true)
    expect(instances[0].options).toEqual({
      sampleInterval: 10,
      maxBufferSize: 10000,
    })
  })
  it('samples the session once and never records a rate-zero session', async () => {
    const { client, profiles } = setup({ profileSessionSampleRate: 0 })
    for (let i = 0; i < 3; i++) {
      client.uiProfiler.startProfiler()
      await client.uiProfiler.stopProfiler()
    }
    await client.flush()
    expect(instances).toHaveLength(0)
    expect(profiles()).toHaveLength(0)
  })
  it('safely degrades for missing API and policy denial', async () => {
    const { client, profiles } = setup()
    vi.stubGlobal('Profiler', undefined)
    expect(() => client.uiProfiler.startProfiler()).not.toThrow()
    vi.stubGlobal(
      'Profiler',
      class {
        constructor() {
          throw new Error('Document-Policy denied')
        }
      },
    )
    expect(() => client.uiProfiler.startProfiler()).not.toThrow()
    await client.uiProfiler.stopProfiler()
    await client.flush()
    expect(profiles()).toHaveLength(0)
  })
  it('shares concurrent sampled roots and associates the first root', async () => {
    const { client, profiles } = setup({
      tracesSampleRate: 1,
      profileLifecycle: 'trace',
    })
    const first = client.startInactiveSpan({ name: 'first' })
    const second = client.startInactiveSpan({ name: 'second' })
    client.startSpan({ name: 'child', parent: first }, () => undefined)
    first.end()
    expect(instances[0].stopped).toBe(false)
    second.end()
    await client.flush()
    expect(instances).toHaveLength(1)
    expect(profiles()[0].profile).toMatchObject({
      name: 'first',
      traceId: first.context.traceId,
      spanId: first.context.spanId,
    })
  })
  it('starts a new recording after an asynchronous stop finishes', async () => {
    const { client, profiles } = setup({
      tracesSampleRate: 1,
      profileLifecycle: 'trace',
    })
    const first = client.startInactiveSpan({ name: 'first' })
    let resolve!: (value: ReturnType<FakeProfiler['trace']>) => void
    instances[0].stopResult = new Promise((r) => {
      resolve = r
    })
    first.end()
    const second = client.startInactiveSpan({ name: 'second' })
    expect(instances).toHaveLength(1)
    resolve(instances[0].trace())
    await vi.advanceTimersByTimeAsync(1)
    expect(instances).toHaveLength(2)
    second.end()
    await client.flush()
    expect(profiles().map((e) => e.profile.name)).toEqual(['first', 'second'])
  })
  it('associates a resumed trace recording with the first root still alive after native stop', async () => {
    const { client, profiles } = setup({
      tracesSampleRate: 1,
      profileLifecycle: 'trace',
    })
    const first = client.startInactiveSpan({ name: 'first' })
    let resolve!: (value: ReturnType<FakeProfiler['trace']>) => void
    instances[0].stopResult = new Promise((r) => {
      resolve = r
    })
    first.end()
    const ended = client.startInactiveSpan({ name: 'ended while waiting' })
    const live = client.startInactiveSpan({ name: 'still alive' })
    ended.end()
    resolve(instances[0].trace())
    await vi.advanceTimersByTimeAsync(1)
    expect(instances).toHaveLength(2)
    live.end()
    await client.flush()
    expect(profiles()).toHaveLength(2)
    expect(profiles()[1].profile).toMatchObject({
      name: 'still alive',
      traceId: live.context.traceId,
      spanId: live.context.spanId,
    })
  })
  it('preserves a queued manual start instead of substituting live trace roots', async () => {
    const { client, profiles } = setup({ tracesSampleRate: 1 })
    client.uiProfiler.startProfiler({ name: 'first manual' })
    let resolve!: (value: ReturnType<FakeProfiler['trace']>) => void
    instances[0].stopResult = new Promise((r) => {
      resolve = r
    })
    const stopped = client.uiProfiler.stopProfiler()
    client.uiProfiler.startProfiler({
      name: 'queued manual',
      traceId: '1'.repeat(32),
      spanId: '2'.repeat(16),
    })
    const unrelated = client.startInactiveSpan({ name: 'unrelated root' })
    resolve(instances[0].trace())
    await stopped
    await client.uiProfiler.stopProfiler()
    unrelated.end()
    await client.flush()
    expect(profiles()[1].profile).toMatchObject({
      name: 'queued manual',
      traceId: '1'.repeat(32),
      spanId: '2'.repeat(16),
    })
  })
  it('flush waits for native stop and sends then retries transient failures', async () => {
    let attempts = 0
    const sent: MonitoringEnvelope[] = []
    const { client } = setup({
      transport: {
        send: async (e: MonitoringEnvelope) => {
          await Promise.resolve()
          if (e.type === 'profile' && ++attempts === 1)
            throw new Error('offline')
          sent.push(e)
        },
      },
    })
    client.uiProfiler.startProfiler()
    let resolve!: (value: ReturnType<FakeProfiler['trace']>) => void
    instances[0].stopResult = new Promise((r) => {
      resolve = r
    })
    let done = false
    void client.uiProfiler.stopProfiler()
    const flush = client.flush().then(() => {
      done = true
    })
    await Promise.resolve()
    expect(done).toBe(false)
    resolve(instances[0].trace())
    await flush
    await client.flush()
    expect(sent.filter((e) => e.type === 'profile')).toHaveLength(1)
    expect(attempts).toBe(2)
  })
  it('stops automatically at 30 seconds and marks the profile truncated', async () => {
    const { client, profiles } = setup()
    client.uiProfiler.startProfiler()
    await vi.advanceTimersByTimeAsync(30001)
    await client.flush()
    expect(profiles()[0].profile).toMatchObject({
      durationMs: 30000,
      truncated: true,
    })
  })
  it('flush does not stop an active manual or trace recording', async () => {
    const { client, profiles } = setup()
    client.uiProfiler.startProfiler()
    await client.flush()
    expect(instances[0].stopped).toBe(false)
    expect(profiles()).toHaveLength(0)
    await client.uiProfiler.stopProfiler()
    await client.flush()
    expect(profiles()).toHaveLength(1)
  })
  it('a slow upload never blocks a new native recording after stop', async () => {
    let release!: () => void
    const uploading = new Promise<void>((resolve) => {
      release = resolve
    })
    const { client } = setup({
      tracesSampleRate: 1,
      profileLifecycle: 'trace',
      transport: {
        send: async (e: MonitoringEnvelope) => {
          await Promise.resolve()
          if (e.type === 'profile') await uploading
        },
      },
    })
    const first = client.startInactiveSpan({ name: 'first' })
    first.end()
    const second = client.startInactiveSpan({ name: 'second' })
    await vi.advanceTimersByTimeAsync(1)
    expect(instances).toHaveLength(2)
    second.end()
    release()
    await client.flush()
  })
})

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { MonitoringEnvelope } from '@pms/monitoring-core'
beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it('enables manual browser profiling with tracing sampling disabled', async () => {
  const { createApp } = await import('vue')
  const sdk = await import('./index.js')
  const envelopes: MonitoringEnvelope[] = []
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal(
    'Profiler',
    class {
      sampleInterval = 10
      started = performance.now()
      stop() {
        return Promise.resolve({
          resources: [],
          frames: [],
          stacks: [],
          samples: [{ timestamp: this.started }],
        })
      }
    },
  )
  sdk.init({
    app: createApp({}),
    dsn: 'https://key@monitor.test/api/sdk/project',
    transport: {
      send: (e) => {
        envelopes.push(e)
        return Promise.resolve()
      },
    },
    tracesSampleRate: 0,
    profileSessionSampleRate: 1,
    integrations: [sdk.browserProfilingIntegration()],
  })
  sdk.uiProfiler.startProfiler({ name: 'manual' })
  await vi.advanceTimersByTimeAsync(10)
  await sdk.uiProfiler.stopProfiler()
  await sdk.flush()
  expect(envelopes.filter((e) => e.type === 'profile')).toMatchObject([
    { profile: { name: 'manual', durationMs: 10 } },
  ])
  expect(envelopes.filter((e) => e.type === 'transaction')).toHaveLength(0)
})
it('profiling remains enabled when automatic browser tracing is explicitly disabled', async () => {
  const { createApp } = await import('vue')
  const sdk = await import('./index.js')
  const envelopes: MonitoringEnvelope[] = []
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal(
    'Profiler',
    class {
      sampleInterval = 10
      stop() {
        return Promise.resolve({
          resources: [],
          frames: [],
          stacks: [],
          samples: [],
        })
      }
    },
  )
  sdk.init({
    app: createApp({}),
    browserTracing: false,
    dsn: 'https://key@monitor.test/api/sdk/project',
    profileSessionSampleRate: 1,
    transport: {
      send: (e) => {
        envelopes.push(e)
        return Promise.resolve()
      },
    },
    integrations: [sdk.browserProfilingIntegration()],
  })
  sdk.uiProfiler.startProfiler()
  await sdk.uiProfiler.stopProfiler()
  await sdk.flush()
  expect(envelopes.filter((e) => e.type === 'profile')).toHaveLength(1)
})
it('records the initial pageload when tracing integration is listed first', async () => {
  const { createApp } = await import('vue')
  const sdk = await import('./index.js')
  const envelopes: MonitoringEnvelope[] = []
  const target = new EventTarget() as Window
  Object.assign(target, {
    document: Object.assign(new EventTarget(), {
      readyState: 'complete',
      visibilityState: 'visible',
    }),
    location: new URL('https://app.test/home'),
    performance: { now: () => performance.now(), getEntriesByType: () => [] },
    fetch: () => Promise.resolve(new Response('', { status: 200 })),
  })
  vi.stubGlobal('window', target)
  vi.stubGlobal(
    'Profiler',
    class {
      sampleInterval = 10
      stop() {
        return Promise.resolve({
          resources: [],
          frames: [],
          stacks: [],
          samples: [],
        })
      }
    },
  )
  sdk.init({
    app: createApp({}),
    dsn: 'https://key@monitor.test/api/sdk/project',
    profileSessionSampleRate: 1,
    tracesSampleRate: 1,
    profileLifecycle: 'trace',
    transport: {
      send: (e) => {
        envelopes.push(e)
        return Promise.resolve()
      },
    },
    integrations: [
      sdk.browserTracingIntegration(),
      sdk.browserProfilingIntegration(),
    ],
  })
  await vi.advanceTimersByTimeAsync(20)
  target.dispatchEvent(new Event('pagehide'))
  await sdk.flush()
  const profile = envelopes.find((e) => e.type === 'profile')
  const root = envelopes
    .filter((e) => e.type === 'transaction')
    .flatMap((e) => e.transaction.spans)
    .find((e) => e.isTransaction)
  expect(profile?.profile).toMatchObject({
    traceId: root?.traceId,
    spanId: root?.spanId,
    durationMs: 20,
  })
})

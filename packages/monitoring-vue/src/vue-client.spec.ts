import { createApp } from 'vue'
import type { App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MonitoringEnvelope, Transport } from '@pms/monitoring-core'

const dsn = 'http://vue-key@localhost:3001/api/sdk/vue-project'
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')

class RecordingTransport implements Transport {
  readonly envelopes: MonitoringEnvelope[] = []

  get eventEnvelopes() {
    return this.envelopes.filter((envelope) => envelope.type === 'event')
  }

  send(envelope: MonitoringEnvelope): Promise<void> {
    this.envelopes.push(envelope)
    return Promise.resolve()
  }
}

function browserTarget() {
  const target = new EventTarget()
  Object.assign(target, { location: { href: 'https://example.test/current' } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: target })
  return target
}

function vueApp(): App {
  return createApp({ template: '<div />' })
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
  else Reflect.deleteProperty(globalThis, 'window')
})

describe('Vue monitoring error capture', () => {
  it('identifies the Vue package in its client report', async () => {
    const { init } = await import('./vue-client.js')
    const transport = new RecordingTransport()

    init({ app: vueApp(), dsn, transport })

    expect(transport.envelopes[0]).toMatchObject({
      version: 1,
      type: 'client_report',
      sdk: { name: '@pms/monitoring-vue', version: '0.1.0' },
    })
  })

  it('captures Vue errors and calls the original handler with its original this and arguments', async () => {
    const { init, getVueClientState } = await import('./vue-client.js')
    const app = vueApp()
    const original = vi.fn(function (this: unknown) {
      expect(this).toBe(app.config)
    })
    app.config.errorHandler = original
    const transport = new RecordingTransport()

    const state = init({ app, dsn, transport })
    const error = new Error('render failed')
    const instance = null
    app.config.errorHandler?.call(app.config, error, instance, 'render')

    expect(state.projectId).toBe('vue-project')
    expect(getVueClientState(app)).toBe(state)
    expect(transport.eventEnvelopes).toHaveLength(1)
    expect(transport.eventEnvelopes[0]?.event.source).toBe('vue')
    expect(transport.eventEnvelopes[0]?.event.message).toBe('render failed')
    expect(original).toHaveBeenCalledExactlyOnceWith(error, instance, 'render')
  })

  it('captures window error events with the error and current URL', async () => {
    const target = browserTarget()
    const { init } = await import('./vue-client.js')
    const transport = new RecordingTransport()
    init({ app: vueApp(), dsn, transport })

    const event = new Event('error')
    Object.assign(event, { error: new Error('script failed'), message: 'fallback' })
    target.dispatchEvent(event)

    expect(transport.eventEnvelopes).toHaveLength(1)
    expect(transport.eventEnvelopes[0]?.event.source).toBe('window')
    expect(transport.eventEnvelopes[0]?.event.message).toBe('script failed')
    expect(transport.eventEnvelopes[0]?.event.url).toBe('https://example.test/current')
  })

  it('uses the error event message when no Error object exists', async () => {
    const target = browserTarget()
    const { init } = await import('./vue-client.js')
    const transport = new RecordingTransport()
    init({ app: vueApp(), dsn, transport })

    const event = new Event('error')
    Object.assign(event, { message: 'resource failed' })
    target.dispatchEvent(event)

    expect(transport.eventEnvelopes[0]?.event.source).toBe('window')
    expect(transport.eventEnvelopes[0]?.event.message).toBe('resource failed')
  })

  it('captures unhandled rejections from the event reason', async () => {
    const target = browserTarget()
    const { init } = await import('./vue-client.js')
    const transport = new RecordingTransport()
    init({ app: vueApp(), dsn, transport })

    const event = new Event('unhandledrejection')
    Object.assign(event, { reason: new Error('promise failed') })
    target.dispatchEvent(event)

    expect(transport.eventEnvelopes).toHaveLength(1)
    expect(transport.eventEnvelopes[0]?.event.source).toBe('unhandledrejection')
    expect(transport.eventEnvelopes[0]?.event.message).toBe('promise failed')
  })

  it('does not wrap one app twice when initialized again with the same options', async () => {
    const target = browserTarget()
    const { init } = await import('./vue-client.js')
    const app = vueApp()
    const transport = new RecordingTransport()
    const options = { app, dsn, transport }

    const first = init(options)
    const handler = app.config.errorHandler
    const second = init(options)
    app.config.errorHandler?.(new Error('render failed'), null, 'render')
    target.dispatchEvent(Object.assign(new Event('error'), { message: 'script failed' }))

    expect(second).toBe(first)
    expect(app.config.errorHandler).toBe(handler)
    expect(transport.envelopes.filter((envelope) => envelope.type === 'client_report')).toHaveLength(1)
    expect(transport.eventEnvelopes.map(({ event }) => event.source)).toEqual(['vue', 'window'])
  })

  it('rejects different options when the same app was already initialized', async () => {
    const { init } = await import('./vue-client.js')
    const app = vueApp()
    const transport = new RecordingTransport()
    init({ app, dsn, transport })

    expect(() =>
      init({ app, dsn: 'http://other-key@localhost:3001/api/sdk/other-project', transport }),
    ).toThrow('already initialized with different options')
  })

  it('installs one global listener across apps while capturing each app Vue error', async () => {
    const target = browserTarget()
    const { init } = await import('./vue-client.js')
    const firstApp = vueApp()
    const secondApp = vueApp()
    const transport = new RecordingTransport()
    init({ app: firstApp, dsn, transport })
    init({ app: secondApp, dsn, transport })

    firstApp.config.errorHandler?.(new Error('first render'), null, 'render')
    secondApp.config.errorHandler?.(new Error('second render'), null, 'render')
    target.dispatchEvent(Object.assign(new Event('error'), { message: 'script failed' }))

    expect(transport.eventEnvelopes.map(({ event }) => event.source)).toEqual([
      'vue',
      'vue',
      'window',
    ])
  })

  it('initializes without window in Node or SSR', async () => {
    Reflect.deleteProperty(globalThis, 'window')
    const { init } = await import('./vue-client.js')

    expect(() => init({ app: vueApp(), dsn, transport: new RecordingTransport() })).not.toThrow()
  })

  it('exports manual captureException with manual source', async () => {
    const { init } = await import('./vue-client.js')
    const { captureException } = await import('./index.js')
    const transport = new RecordingTransport()
    init({ app: vueApp(), dsn, transport })

    await captureException(new Error('manual'))

    expect(transport.eventEnvelopes).toHaveLength(1)
    expect(transport.eventEnvelopes[0]?.event.source).toBe('manual')
    expect(transport.eventEnvelopes[0]?.event.message).toBe('manual')
  })

  it('rejects a value that is not a Vue application', async () => {
    const { init } = await import('./vue-client.js')
    expect(() => init({ app: {} as never, dsn })).toThrow('Vue app')
  })
})

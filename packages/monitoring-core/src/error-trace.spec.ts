import { afterEach, describe, expect, it } from 'vitest'
import { createMonitoringClient } from './client.js'
import type { MonitoringEnvelope } from './types.js'

const clients: ReturnType<typeof createMonitoringClient>[] = []
afterEach(() => clients.splice(0).forEach(client => client.resetClientForTests()))
function setup(rate = 1) {
  const sent: MonitoringEnvelope[] = []
  const client = createMonitoringClient()
  clients.push(client)
  client.init({ dsn: 'https://key@monitor.test/api/sdk/project', tracesSampleRate: rate,
    transport: { send: envelope => { sent.push(envelope); return Promise.resolve() } } })
  return { client, events: () => sent.filter(e => e.type === 'event').map(e => e.event) }
}

describe('error trace correlation', () => {
  it('binds captures to the active child span and keeps browser context', () => {
    const { client, events } = setup()
    client.startSpan({ name: 'page' }, root =>
      client.startSpan({ name: 'action', parent: root }, span => {
        void client.captureException(new Error('failed'))
        expect(events()[0]?.contexts).toMatchObject({ trace: span.context })
      }))
    expect(events()[0]?.message).toBe('failed')
  })

  it('retains the throwing span when an exception is captured after unwinding', async () => {
    const { client, events } = setup()
    const failure = new Error('thrown')
    let expected: unknown
    try {
      client.startSpan({ name: 'page' }, root => client.startSpan({ name: 'child', parent: root }, span => {
        expected = span.context
        throw failure
      }))
    } catch { await client.captureException(failure) }
    expect(events()[0]?.contexts).toMatchObject({ trace: expected })
  })

  it('retains the rejecting span after its promise has settled', async () => {
    const { client, events } = setup()
    const failure = new Error('rejected')
    let expected: unknown
    await client.startSpan({ name: 'request' }, span => {
      expected = span.context
      return Promise.reject(failure)
    }).catch(error => client.captureException(error))
    expect(events()[0]?.contexts).toMatchObject({ trace: expected })
  })

  it('records the unsampled decision and leaves errors without context unbound', async () => {
    const { client, events } = setup(0)
    await client.captureException(new Error('outside'))
    expect(events()[0]?.contexts).not.toHaveProperty('trace')
    client.startSpan({ name: 'unsampled' }, span => {
      void client.captureException(new Error('inside'))
      expect(events()[1]?.contexts).toMatchObject({ trace: { ...span.context, sampled: false } })
    })
  })

  it('binds late page errors until the page session ends', async () => {
    const { client, events } = setup()
    const page = client.startInactiveSpan({ name: 'lab', op: 'navigation' })
    client.setPageSpan(page)
    page.end()
    await client.captureException(new Error('after page load'))
    expect(events()[0]?.contexts).toMatchObject({ trace: page.context })
    client.endPageSession()
    await client.captureException(new Error('after leaving'))
    expect(events()[1]?.contexts).not.toHaveProperty('trace')
  })
})

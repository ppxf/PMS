import { afterEach, describe, expect, it } from 'vitest'
import { createMonitoringClient } from './client.js'
import type { MonitoringEnvelope } from './types.js'
import type { TraceContext } from './tracing-types.js'

const clients: ReturnType<typeof createMonitoringClient>[] = []
afterEach(() => clients.splice(0).forEach(client => client.resetClientForTests()))
function setup(rate = 1) {
  const sent: MonitoringEnvelope[] = []
  const client = createMonitoringClient()
  clients.push(client)
  client.init({ dsn: 'https://key@monitor.test/api/sdk/project', tracesSampleRate: rate,
    transport: { send: envelope => { sent.push(envelope); return Promise.resolve() } } })
  return { client, events: () => sent.filter(e => e.type === 'event').map(e => e.event), spans: () => sent.filter(e => e.type === 'transaction').flatMap(e => e.transaction.spans) }
}

describe('error trace correlation', () => {
  it('persists a failed request with its original ID when the page recording is full', async () => {
    const { client, events, spans } = setup()
    const page = client.startInactiveSpan({ name: 'busy page', op: 'pageload' })
    client.setPageSpan(page)
    for (let i = 0; i < 199; i++) client.startInactiveSpan({ name: 'work', parent: page }).end()
    const request = client.startInactiveSpan({ name: 'GET /failed', op: 'http.client', parent: page })
    request.end('error')
    const failure = new Error('request failed')
    client.bindExceptionToSpan(failure, request)
    await client.captureException(failure, { source: 'http' })
    page.end()
    await client.flush()
    expect(events()[0].contexts?.trace).toEqual(request.context)
    expect(spans().find(span => span.spanId === request.context.spanId)).toMatchObject({
      op: 'http.client', traceId: page.context.traceId, parentSpanId: page.context.spanId, status: 'error',
    })
  })
  it('binds captures to the active child span and keeps browser context', () => {
    const { client, events } = setup()
    client.startSpan({ name: 'page' }, root =>
      client.startSpan({ name: 'action', parent: root }, span => {
        void client.captureException(new Error('failed'))
        expect(events()[0]?.contexts).toMatchObject({ trace: span.context })
      }))
    expect(events()[0]?.message).toBe('failed')
  })

  it('retains an explicitly captured child association when the same object is captured later', async () => {
    const { client, events } = setup()
    const failure = new Error('same failure')
    let expected: TraceContext | undefined
    client.startSpan({ name: 'page' }, page => client.startSpan({ name: 'action', parent: page }, child => {
      expected = child.context
      void client.captureException(failure)
    }))
    await client.captureException(failure)
    expect(events().map(event => event.contexts?.trace)).toEqual([expected, expected])
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

  it('creates a child error span under a rejecting root after its promise has settled', async () => {
    const { client, events, spans } = setup()
    const failure = new Error('rejected')
    let expected: TraceContext | undefined
    await client.startSpan({ name: 'request' }, span => {
      expected = span.context
      return Promise.reject(failure)
    }).catch(error => client.captureException(error))
    const context = events()[0]?.contexts?.trace
    expect(context?.traceId).toBe(expected?.traceId)
    expect(context?.spanId).not.toBe(expected?.spanId)
    await client.flush()
    expect(spans().find(span => span.spanId === context?.spanId)).toMatchObject({ op: 'error', parentSpanId: expected?.spanId })
  })

  it('records the unsampled decision and leaves disabled tracing without context unbound', async () => {
    const { client, events } = setup(0)
    await client.captureException(new Error('outside'))
    expect(events()[0]?.contexts).not.toHaveProperty('trace')
    client.startSpan({ name: 'unsampled' }, span => {
      void client.captureException(new Error('inside'))
      expect(events()[1]?.contexts?.trace).toMatchObject({ traceId: span.context.traceId, sampled: false })
      expect(events()[1]?.contexts?.trace?.spanId).not.toBe(span.context.spanId)
    })
  })

  it('gives simultaneous page errors distinct child spans rather than the page root', async () => {
    const { client, events, spans } = setup()
    const page = client.startInactiveSpan({ name: 'lab', op: 'navigation', pageRoute: '/lab' })
    client.setPageSpan(page)
    await Promise.all([client.captureException(new Error('first')), client.captureException(new Error('second'))])
    const contexts = events().map(event => event.contexts?.trace)
    expect(new Set(contexts.map(context => context?.spanId)).size).toBe(2)
    expect(contexts.every(context => context?.traceId === page.context.traceId && context?.spanId !== page.context.spanId)).toBe(true)
    page.end()
    await client.flush()
    for (const context of contexts) expect(spans().find(span => span.spanId === context?.spanId)).toMatchObject({
      op: 'error', parentSpanId: page.context.spanId, status: 'error', pageRoute: '/lab', isTransaction: false,
    })
  })

  it('gives late page errors their own persisted span after the page was sealed', async () => {
    const { client, events, spans } = setup()
    const page = client.startInactiveSpan({ name: 'lab', op: 'navigation' })
    client.setPageSpan(page)
    page.end()
    await client.flush()
    await client.captureException(new Error('after page load'))
    const context = events()[0]?.contexts?.trace
    expect(context?.traceId).toBe(page.context.traceId)
    expect(context?.spanId).not.toBe(page.context.spanId)
    await client.flush()
    expect(spans().find(span => span.spanId === context?.spanId)).toMatchObject({ op: 'error', parentSpanId: page.context.spanId, status: 'error' })
    client.endPageSession()
    await client.captureException(new Error('after leaving'))
    expect(events()[1]?.contexts?.trace?.traceId).not.toBe(page.context.traceId)
  })
})

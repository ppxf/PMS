import { afterEach, expect, it, vi } from 'vitest'
import { createMonitoringClient } from './client.js'
import { HttpTransport } from './http-transport.js'
import type { MonitoringEnvelope } from './types.js'

afterEach(() => vi.useRealTimers())
function setup() {
  const envelopes: MonitoringEnvelope[] = []
  const client = createMonitoringClient()
  client.init({ dsn: 'https://key@monitor.test/api/sdk/project', tracesSampleRate: 1,
    transport: { send: e => { envelopes.push(e); return Promise.resolve() } } })
  const spans = () => envelopes.filter(e => e.type === 'transaction').flatMap(e => e.transaction.spans)
  return { client, spans }
}
it('keeps an old page request alive across the page measurement boundary', async () => {
  vi.useFakeTimers()
  const { client, spans } = setup()
  const page = client.startInactiveSpan({ name: '/old', op: 'navigation' })
  const request = client.startInactiveSpan({ name: 'request', op: 'http.client', parent: page, pageRoute: '/old' })
  page.end('ok', 'navigation')
  await vi.advanceTimersByTimeAsync(2000)
  expect(request.ended).toBe(false)
  expect(spans()).toHaveLength(0)
  request.end('ok')
  await vi.advanceTimersByTimeAsync(1000)
  expect(spans()).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: '/old', truncated: false, attributes: { 'pms.measurement.status': 'lifecycle' } }),
    expect.objectContaining({ name: 'request', truncated: false, pageRoute: '/old', status: 'ok', parentSpanId: page.context.spanId }),
  ]))
  client.resetClientForTests()
})
it('bounds the grace period and distinguishes unfinished measurement from lost records', async () => {
  vi.useFakeTimers()
  const { client, spans } = setup()
  const page = client.startInactiveSpan({ name: '/old', op: 'navigation' })
  const child = client.startInactiveSpan({ name: 'pending', parent: page })
  page.end('ok', 'navigation')
  await vi.advanceTimersByTimeAsync(5000)
  expect(child.ended).toBe(true)
  expect(spans()[1]).toMatchObject({ truncated: false, droppedSpanCount: 0, status: 'cancelled',
    attributes: { 'pms.measurement.status': 'interrupted' } })
  client.resetClientForTests()
})
it('marks the deadline as timeout rather than data loss', async () => {
  vi.useFakeTimers()
  const { client, spans } = setup()
  client.startInactiveSpan({ name: 'pending' })
  await vi.advanceTimersByTimeAsync(31000)
  expect(spans()[0]).toMatchObject({ truncated: false, status: 'deadline_exceeded', attributes: { 'pms.measurement.status': 'timeout' } })
  client.resetClientForTests()
})
it('keeps small trace uploads alive, respects the shared byte budget, and releases it', async () => {
  const requests: RequestInit[] = []
  const finish: (() => void)[] = []
  const fetcher = (async (_url: unknown, init: RequestInit) => {
    requests.push(init)
    await new Promise<void>(resolve => finish.push(resolve))
    return { ok: true }
  }) as typeof fetch
  const transport = new HttpTransport('https://monitor.test', 'key', fetcher)
  const anotherClient = new HttpTransport('https://monitor.test', 'key', fetcher)
  const envelope = { version: 1, type: 'transaction', sentAt: new Date().toISOString(), transaction: { eventId: 'event', spans: [] }, padding: 'x'.repeat(35000) } as unknown as MonitoringEnvelope
  const first = transport.send(envelope)
  const second = anotherClient.send(envelope)
  expect(requests.map(request => request.keepalive)).toEqual([true, false])
  finish.splice(0).forEach(resolve => resolve())
  await Promise.all([first, second])
  const third = transport.send(envelope)
  expect(requests[2]?.keepalive).toBe(true)
  finish.splice(0).forEach(resolve => resolve())
  await third
})

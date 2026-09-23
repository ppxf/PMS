import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captureException, getClientState, init, resetClientForTests } from './client.js'
import { NoopTransport } from './types.js'
import type { EventEnvelope, MonitoringEnvelope, Transport } from './types.js'

const dsn = 'https://public-key@monitor.example.com/api/sdk/project-id'

class RecordingTransport implements Transport {
  envelopes: MonitoringEnvelope[] = []

  send(envelope: MonitoringEnvelope): Promise<void> {
    this.envelopes.push(envelope)
    return Promise.resolve()
  }

  get eventEnvelopes(): EventEnvelope[] {
    return this.envelopes.filter((envelope): envelope is EventEnvelope => envelope.type === 'event')
  }
}

describe('monitoring core initialization and capture', () => {
  beforeEach(() => {
    resetClientForTests()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 202 })))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('normalizes a valid PMS DSN into public client state', () => {
    const state = init({
      dsn: 'https://public-key@monitor.example.com/api/sdk/550e8400-e29b-41d4-a716-446655440000/',
      environment: 'production',
      release: 'web@1.2.0',
    })

    expect(state).toEqual({
      initialized: true,
      dsn: 'https://public-key@monitor.example.com/api/sdk/550e8400-e29b-41d4-a716-446655440000',
      endpoint: 'https://monitor.example.com/api/sdk/550e8400-e29b-41d4-a716-446655440000',
      publicKey: 'public-key',
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      environment: 'production',
      release: 'web@1.2.0',
    })
    expect(getClientState()).toEqual(state)
  })

  it.each([
    ['ftp://key@monitor.example.com/api/sdk/project-id', 'http or https'],
    ['https://monitor.example.com/api/sdk/project-id', 'public key'],
    ['https://key@monitor.example.com/not-sdk/project-id', '/api/sdk/'],
  ])('rejects invalid DSN %s', (dsn, message) => {
    expect(() => init({ dsn })).toThrow(message)
  })

  it.each([
    'https://key@monitor.example.com/api/sdk/project-id?x=1',
    'https://key@monitor.example.com/api/sdk/project-id#fragment',
    'https://key@monitor.example.com/api/sdk/project-id?',
    'https://key@monitor.example.com/api/sdk/project-id#',
  ])('rejects a DSN with query or hash: %s', (dsn) => {
    expect(() => init({ dsn })).toThrow('PMS DSN must not include query or hash')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('is idempotent for the same options and rejects conflicting initialization', () => {
    const first = init({ dsn: 'http://key@localhost:3001/api/sdk/project-id' })
    expect(init({ dsn: 'http://key@localhost:3001/api/sdk/project-id/' })).toBe(first)
    expect(() =>
      init({ dsn: 'http://other@localhost:3001/api/sdk/another-project' }),
    ).toThrow('already initialized')
  })

  it('rejects reinitialization with a different transport', () => {
    const firstTransport = new NoopTransport()
    const secondTransport = new NoopTransport()

    init({ dsn, transport: firstTransport })

    expect(() => init({ dsn, transport: secondTransport })).toThrow('already initialized')
  })

  it('uses a transport that resolves without side effects', async () => {
    const transport = new NoopTransport()
    await expect(
      transport.send({
        version: 1,
        type: 'client_report',
        sentAt: '2026-09-22T00:00:00.000Z',
        sdk: { name: '@pms/monitoring-core', version: '0.1.0' },
      }),
    ).resolves.toBeUndefined()
  })

  it('sends one client report to the DSN envelope endpoint on init', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 202 }))
    init({ dsn, fetch: fetcher, environment: 'production', release: 'web@1.2.0' })
    init({ dsn: `${dsn}/`, fetch: fetcher, environment: 'production', release: 'web@1.2.0' })
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    expect(fetcher).toHaveBeenCalledWith(
      'https://monitor.example.com/api/sdk/project-id/envelope',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-PMS-Key': 'public-key',
        }),
      }),
    )
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      version: 1,
      type: 'client_report',
      sdk: { name: '@pms/monitoring-core', version: '0.1.0' },
      environment: 'production',
      release: 'web@1.2.0',
    })
  })

  it('normalizes and sends an exception event', async () => {
    const transport = new RecordingTransport()
    init({ dsn, transport, environment: 'production', release: 'web@1.2.0' })
    await captureException(new TypeError('boom'), {
      source: 'manual',
      url: 'https://app.example.com/page',
      tags: { section: 'checkout' },
    })

    expect(transport.envelopes.filter((envelope) => envelope.type === 'client_report')).toHaveLength(1)
    expect(transport.eventEnvelopes).toHaveLength(1)
    expect(transport.eventEnvelopes[0]?.event).toMatchObject({
      type: 'error',
      level: 'error',
      source: 'manual',
      message: 'boom',
      exception: { type: 'TypeError', value: 'boom' },
      url: 'https://app.example.com/page',
      environment: 'production',
      release: 'web@1.2.0',
      tags: { section: 'checkout' },
    })
    expect(transport.eventEnvelopes[0]?.event.eventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    expect(Date.parse(transport.eventEnvelopes[0]?.event.timestamp ?? '')).not.toBeNaN()
    expect(Date.parse(transport.eventEnvelopes[0]?.sentAt ?? '')).not.toBeNaN()
  })

  it('turns strings and unknown objects into readable exceptions', async () => {
    const transport = new RecordingTransport()
    init({ dsn, transport })
    await captureException('plain failure')
    await captureException({ reason: 'bad state' })
    const circular: Record<string, unknown> = { reason: 'circular' }
    circular.self = circular
    await expect(captureException(circular)).resolves.toBeUndefined()

    expect(transport.eventEnvelopes.map(({ event }) => event.message)).toEqual([
      'plain failure',
      '{"reason":"bad state"}',
      '[object Object]',
    ])
    expect(transport.eventEnvelopes[0]?.event.exception).toMatchObject({ type: 'String', value: 'plain failure' })
  })

  it('does not throw when an unknown object rejects inspection and serialization', async () => {
    const transport = new RecordingTransport()
    init({ dsn, transport })
    const hostile = new Proxy({}, {
      getPrototypeOf: () => { throw new Error('inspection failed') },
      get: () => { throw new Error('serialization failed') },
    })

    await expect(captureException(hostile)).resolves.toBeUndefined()
    expect(transport.eventEnvelopes[0]?.event.message).toBe('[unserializable]')
  })

  it('caps event fields and tag count at the protocol limits', async () => {
    const transport = new RecordingTransport()
    init({ dsn, transport, environment: 'e'.repeat(200), release: 'r'.repeat(200) })
    const error = new Error('m'.repeat(2100))
    error.name = 'T'.repeat(200)
    error.stack = 's'.repeat(70_000)
    const tags = Object.fromEntries(Array.from({ length: 55 }, (_, index) => [`key-${index}-${'k'.repeat(70)}`, 'v'.repeat(300)]))
    await captureException(error, { source: 'manual', url: 'u'.repeat(2200), tags })

    const event = transport.eventEnvelopes[0]?.event
    expect(event?.message).toHaveLength(2_000)
    expect(event?.exception.value).toHaveLength(2_000)
    expect(event?.exception.type).toHaveLength(128)
    expect(event?.exception.stacktrace).toHaveLength(65_536)
    expect(event?.url).toHaveLength(2_048)
    expect(event?.environment).toHaveLength(128)
    expect(event?.release).toHaveLength(128)
    expect(Object.entries(event?.tags ?? {})).toHaveLength(50)
    expect(Object.keys(event?.tags ?? {})[0]).toHaveLength(64)
    expect(Object.values(event?.tags ?? {})[0]).toHaveLength(256)
  })

  it('limits a multibyte stacktrace to 64 KiB', async () => {
    const transport = new RecordingTransport()
    init({ dsn, transport })
    const error = new Error('boom')
    error.stack = '界'.repeat(30_000)
    await captureException(error)

    expect(new TextEncoder().encode(transport.eventEnvelopes[0]?.event.exception.stacktrace).length)
      .toBeLessThanOrEqual(65_536)
  })

  it('does not reject when the network request fails', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'))
    init({ dsn, fetch: fetcher })
    await expect(captureException(new Error('boom'))).resolves.toBeUndefined()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('resolves on a non-2xx response without retrying', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
    init({ dsn, fetch: fetcher })
    await expect(captureException(new Error('boom'))).resolves.toBeUndefined()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does not send an exception before initialization', async () => {
    await expect(captureException(new Error('boom'))).resolves.toBeUndefined()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})

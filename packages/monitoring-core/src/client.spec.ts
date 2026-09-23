import { beforeEach, describe, expect, it } from 'vitest'
import { getClientState, init, resetClientForTests } from './client.js'
import { NoopTransport } from './types.js'

describe('monitoring core initialization', () => {
  beforeEach(() => resetClientForTests())

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
    const dsn = 'http://key@localhost:3001/api/sdk/project-id'

    init({ dsn, transport: firstTransport })

    expect(() => init({ dsn, transport: secondTransport })).toThrow('already initialized')
  })

  it('uses a transport that resolves without side effects', async () => {
    const transport = new NoopTransport()
    await expect(
      transport.send({
        eventId: 'event-1',
        timestamp: '2026-09-22T00:00:00.000Z',
        type: 'error',
      }),
    ).resolves.toBeUndefined()
  })
})

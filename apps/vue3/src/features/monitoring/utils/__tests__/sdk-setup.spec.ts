import { describe, expect, it } from 'vitest'
import { buildCheckSnippet, buildEnvSnippet, parseDsn } from '../sdk-setup'

const dsn = 'http://abc123@localhost:3001/api/sdk/550e8400-e29b-41d4-a716-446655440000'

describe('SDK setup helpers', () => {
  it('parses a PMS DSN', () => {
    expect(parseDsn(dsn)).toEqual({
      checkUrl: 'http://localhost:3001/api/sdk/check',
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      publicKey: 'abc123',
    })
  })

  it('builds environment and dependency-free check instructions', () => {
    expect(buildEnvSnippet(dsn)).toBe(`VITE_PMS_DSN=${dsn}`)
    const snippet = buildCheckSnippet(dsn)
    expect(snippet).toContain("fetch('http://localhost:3001/api/sdk/check'")
    expect(snippet).toContain('550e8400-e29b-41d4-a716-446655440000')
    expect(snippet).toContain('abc123')
    expect(snippet).not.toContain('Sentry')
    expect(snippet).not.toContain('Replay')
  })

  it('rejects non-http DSNs', () => {
    expect(() => parseDsn('pms://key@localhost/project')).toThrow('DSN 必须使用 HTTP 或 HTTPS')
  })
})

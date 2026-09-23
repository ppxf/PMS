import { describe, expect, it } from 'vitest'
import { buildEnvSnippet, buildInitSnippet, buildInstallSnippet } from '../sdk-setup'

const dsn = 'http://abc123@localhost:3001/api/sdk/550e8400-e29b-41d4-a716-446655440000'

describe('SDK setup helpers', () => {
  it('builds single-package SDK installation and initialization instructions', () => {
    expect(buildInstallSnippet()).toBe(
      'pnpm add ./vendor/pms-monitoring-vue-0.1.0.tgz',
    )
    expect(buildEnvSnippet(dsn)).toBe(`VITE_PMS_DSN=${dsn}`)
    const snippet = buildInitSnippet()
    expect(snippet).toContain("from '@pms/monitoring-vue'")
    expect(snippet).toContain('dsn: import.meta.env.VITE_PMS_DSN')
    expect(snippet).toContain('environment: import.meta.env.MODE')
    expect(snippet).not.toContain('/api/sdk/check')
    expect(snippet).not.toContain('fetch(')
    expect(snippet).not.toContain('Sentry')
    expect(snippet).not.toContain('Replay')
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildEnvSnippet,
  buildInitSnippet,
  buildInstallSnippet,
  buildBrowserTracesInitSnippet,
  buildBrowserTracesInstallSnippet,
} from '../sdk-setup'

const dsn = 'http://abc123@localhost:3001/api/sdk/550e8400-e29b-41d4-a716-446655440000'

describe('SDK setup helpers', () => {
  it('provides independent trace-only browser installation and initialization', () => {
    expect(buildBrowserTracesInstallSnippet()).toBe(
      'pnpm add @pms/monitoring-vue @pms/monitoring-browser',
    )
    const snippet = buildBrowserTracesInitSnippet()
    expect(snippet).toContain("import { init } from '@pms/monitoring-vue'")
    expect(snippet).toContain("import { browserTracingIntegration } from '@pms/monitoring-browser'")
    expect(snippet).toContain('init({')
    expect(snippet).toContain('integrations: [browserTracingIntegration()]')
    expect(snippet).toContain('tracesSampleRate: import.meta.env.DEV ? 1 : 0.1')
    expect(snippet).not.toContain('captureException')
    expect(snippet).not.toContain('tracePropagationTargets')
    expect(snippet).not.toContain('initTraces')
  })
  it('only includes optional tracing initialization for enabled projects', () => {
    expect(buildInitSnippet(false)).not.toContain('tracesSampleRate')
    expect(buildInitSnippet(true)).toContain('tracesSampleRate: import.meta.env.DEV ? 1 : 0.1')
    expect(buildInitSnippet(true)).toContain('router, // 可选')
    expect(buildInitSnippet(true)).toContain('integrations: [browserTracingIntegration()]')
    expect(buildInitSnippet(false)).not.toContain('monitoring-browser')
  })
  it('builds registry-based SDK installation and initialization instructions', () => {
    expect(buildInstallSnippet()).toBe('pnpm add @pms/monitoring-vue')
    expect(buildEnvSnippet(dsn)).toBe(`VITE_PMS_DSN=${dsn}`)
    const snippet = buildInitSnippet()
    expect(snippet).toContain(
      "import { captureException, init as initPmsMonitoring } from '@pms/monitoring-vue'",
    )
    expect(snippet).toContain('dsn: import.meta.env.VITE_PMS_DSN')
    expect(snippet).toContain('debug: import.meta.env.DEV')
    expect(snippet).toContain('environment: import.meta.env.MODE')
    expect(snippet).not.toContain('release')
    expect(snippet).toContain("captureException(new Error('PMS SDK test error'))")
    expect(snippet).not.toContain('/api/sdk/check')
    expect(snippet).not.toContain('fetch(')
    expect(snippet).not.toContain('Sentry')
    expect(snippet).not.toContain('Replay')
  })
})

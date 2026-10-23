import type { MonitoringIntegration } from '@pms/monitoring-core'

export interface BrowserProfilingIntegration extends MonitoringIntegration {
  readonly name: 'BrowserProfiling'
}

/** Enable profiling independently of transaction sampling and browser tracing. */
export function browserProfilingIntegration(): BrowserProfilingIntegration {
  return Object.freeze({
    name: 'BrowserProfiling' as const,
    setup({ client }: Parameters<MonitoringIntegration['setup']>[0]) {
      client.enableProfiling?.()
    },
  })
}

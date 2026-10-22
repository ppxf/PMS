import { createBrowserTracing } from '@pms/monitoring-core'
import type { MonitoringIntegration } from '@pms/monitoring-core'

export interface BrowserTracingIntegration extends MonitoringIntegration {
  readonly name: 'BrowserTracing'
}

/** A plugin factory; importing or constructing it does not initialize a client. */
export function browserTracingIntegration(): BrowserTracingIntegration {
  const installed = new WeakSet<object>()
  return Object.freeze({
    name: 'BrowserTracing' as const,
    setup({ client, window, router }: Parameters<MonitoringIntegration['setup']>[0]) {
      if (!window || installed.has(client)) return
      const tracing = createBrowserTracing(client)
      tracing.install(window)
      installed.add(client)
      if (router) {
        router.beforeEach(to => { tracing.startNavigation(to.matched.at(-1)?.path ?? to.path) })
        router.afterEach((_to, _from, failure) => {
          if (failure) tracing.endNavigation('navigation_failed')
          else tracing.navigationReady()
        })
      }
    },
  })
}

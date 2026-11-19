import { createBrowserTracing } from '@pmspulse/monitoring-core'
import type { MonitoringIntegration } from '@pmspulse/monitoring-core'

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
        const initialRoute = router.currentRoute?.value
        let initialNavigation = initialRoute?.matched.length === 0 && initialRoute.path === '/'
        if (initialNavigation) tracing.startInitialNavigation()
        router.beforeEach((to, from) => {
          const name = to.matched.at(-1)?.path ?? to.path
          const isInitialRoute = initialNavigation && (!from || (from.matched.length === 0 && from.path === '/'))
          if (!isInitialRoute || !tracing.startInitialNavigation(name)) tracing.startNavigation(name)
        })
        router.afterEach((_to, _from, failure) => {
          initialNavigation = false
          if (failure) tracing.endNavigation('navigation_failed')
          else tracing.navigationReady()
        })
      }
    },
  })
}

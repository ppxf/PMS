import { createBrowserTracing, createMonitoringClient } from '@pms/monitoring-core'
import type { ClientState, MonitoringInitOptions } from '@pms/monitoring-core'
import type { BrowserTracingIntegration } from './browser-tracing-integration.js'
export { browserTracingIntegration } from './browser-tracing-integration.js'
export type { BrowserTracingIntegration } from './browser-tracing-integration.js'

export type BrowserMonitoringInitOptions = Omit<MonitoringInitOptions, 'sdk'> & {
  browserTracing?: boolean
  errorMonitoring?: boolean
  integrations?: readonly BrowserTracingIntegration[]
}
export type BrowserTracesInitOptions = Omit<BrowserMonitoringInitOptions, 'errorMonitoring'> & {
  tracesSampleRate: number
}

const installedWindows = new WeakSet<Window>()
const client = createMonitoringClient()
const instrumentation = createBrowserTracing(client)
let initializedFeatures: { errors: boolean; tracing: boolean } | undefined
const { captureException: captureCoreException, init: initCore, getClientState, startSpan, startInactiveSpan, flush, getTraceStats } = client
export const { metrics, getMetricStats } = client
export const { logger, getLogStats, captureConsoleLogs } = client
export { getClientState, startSpan, startInactiveSpan, flush, getTraceStats }

/** Installs handlers for this browser SDK instance only. */
export function installBrowserHandlers(browserWindow: Window): void {
  if (installedWindows.has(browserWindow)) return

  const capture = (error: unknown, source: 'window' | 'unhandledrejection') => {
    try {
      void captureCoreException(error, { source }).catch(() => undefined)
    } catch {
      // Monitoring failures must not reach application error handlers.
    }
  }

  browserWindow.addEventListener('error', (event) => {
    capture(event.error ?? event.message, 'window')
  })
  browserWindow.addEventListener('unhandledrejection', (event) => {
    capture(event.reason, 'unhandledrejection')
  })
  installedWindows.add(browserWindow)
}

export function init(options: BrowserMonitoringInitOptions): ClientState {
  const errors = options.errorMonitoring !== false
  const tracing = options.browserTracing !== false &&
    (options.integrations === undefined || options.integrations.some(i => i.name === 'BrowserTracing'))
  if (initializedFeatures && (initializedFeatures.errors !== errors || initializedFeatures.tracing !== tracing)) {
    throw new Error('PMS monitoring already initialized with different browser options')
  }
  const state = initCore({
    ...options,
    sdk: { name: '@pms/monitoring-browser', version: '0.1.0' },
  })
  initializedFeatures = { errors, tracing }
  if (typeof window !== 'undefined' && errors) installBrowserHandlers(window)
  if (typeof window !== 'undefined' && (options.tracesSampleRate ?? 0) > 0 && tracing) instrumentation.install(window)
  return state
}

/** Trace-only initialization: does not subscribe to browser global errors. */
export function initTraces(options: BrowserTracesInitOptions): ClientState {
  return init({ ...options, errorMonitoring: false })
}

export const captureException = (error: unknown) =>
  captureCoreException(error, { source: 'manual' })

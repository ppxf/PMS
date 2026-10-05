import { createMonitoringClient } from '@pms/monitoring-core'
import type {
  ClientState,
  MonitoringEventSource,
  MonitoringInitOptions,
  MonitoringIntegration,
  MonitoringRouter,
} from '@pms/monitoring-core'
import type { App } from 'vue'

export interface VueMonitoringInitOptions extends Omit<MonitoringInitOptions, 'sdk'> {
  app: App
  browserTracing?: boolean
  integrations?: readonly MonitoringIntegration[]
  router?: MonitoringRouter
}

const appStates = new WeakMap<App, ClientState>()
const installedApps = new WeakSet<App>()
const installedWindows = new WeakSet<Window>()
const client = createMonitoringClient()
const { captureException: captureCoreException, getClientState: getCoreClientState, init: initCore, startSpan, startInactiveSpan, flush, getTraceStats } = client
let configuredIntegrations: readonly MonitoringIntegration[] | undefined
let configuredRouter: MonitoringRouter | undefined
export const { metrics, getMetricStats } = client
export const { logger, getLogStats, captureConsoleLogs } = client
export { startSpan, startInactiveSpan, flush, getTraceStats }

function capture(error: unknown, source: MonitoringEventSource): void {
  try {
    void captureCoreException(error, { source }).catch(() => undefined)
  } catch {
    // Reporting failures must never reach Vue or browser error handlers.
  }
}

function installVueHandler(app: App): void {
  if (installedApps.has(app)) return
  const originalHandler = app.config.errorHandler
  app.config.errorHandler = function (this: unknown, error, instance, info) {
    capture(error, 'vue')
    originalHandler?.call(this, error, instance, info)
  }
  installedApps.add(app)
}

function installBrowserHandlers(browserWindow: Window): void {
  if (installedWindows.has(browserWindow)) return
  browserWindow.addEventListener('error', (event) => capture(event.error ?? event.message, 'window'))
  browserWindow.addEventListener('unhandledrejection', (event) => capture(event.reason, 'unhandledrejection'))
  installedWindows.add(browserWindow)
}

function isVueApp(value: unknown): value is App {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<App>
  return typeof candidate.use === 'function' && typeof candidate.mount === 'function' && !!candidate.config
}

export function init(options: VueMonitoringInitOptions): ClientState {
  if (!isVueApp(options.app)) throw new TypeError('PMS monitoring init requires a Vue app')

  const integrations = options.browserTracing === false ? [] : options.integrations ?? []
  if (integrations.some(i => !i || typeof i.setup !== 'function' || typeof i.name !== 'string')) {
    throw new TypeError('PMS integrations require a name and setup function')
  }
  if (new Set(integrations.map(i => i.name)).size !== integrations.length) throw new TypeError('Duplicate PMS integration')
  if (configuredIntegrations && (integrations.length !== configuredIntegrations.length ||
    integrations.some((i, index) => i !== configuredIntegrations![index]) ||
    options.router !== configuredRouter)) {
    throw new Error('PMS monitoring already initialized with different integration options')
  }

  const { app, ...coreOptions } = options
  const state = initCore({
    ...coreOptions,
    tracesSampleRate: integrations.length ? options.tracesSampleRate : 0,
    sdk: { name: '@pms/monitoring-vue', version: '0.1.0' },
  })
  configuredIntegrations = [...integrations]
  configuredRouter = options.router
  const existing = appStates.get(app)
  if (existing) return existing
  appStates.set(app, state)
  installVueHandler(app)
  if (typeof window !== 'undefined') installBrowserHandlers(window)
  if (typeof window !== 'undefined' && (options.tracesSampleRate ?? 0) > 0 && options.browserTracing !== false) {
    for (const integration of integrations) integration.setup({ client, window, router: options.router })
  }
  return state
}

export const captureException = (error: unknown) =>
  captureCoreException(error, { source: 'manual' })

export function getVueClientState(app: App): ClientState | undefined {
  return appStates.get(app)
}

export function getClientState(): ClientState | undefined {
  return getCoreClientState()
}

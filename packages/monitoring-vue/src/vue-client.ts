import {
  captureException as captureCoreException,
  getClientState as getCoreClientState,
  init as initCore,
} from '@pms/monitoring-core'
import type {
  ClientState,
  MonitoringEventSource,
  MonitoringInitOptions,
} from '@pms/monitoring-core'
import type { App } from 'vue'

export interface VueMonitoringInitOptions extends Omit<MonitoringInitOptions, 'sdk'> {
  app: App
}

const appStates = new WeakMap<App, ClientState>()
const installedApps = new WeakSet<App>()
const installedWindows = new WeakSet<Window>()

function capture(error: unknown, source: MonitoringEventSource, browserWindow?: Window): void {
  let url: string | undefined
  try {
    url = browserWindow?.location.href
  } catch {
    // Location can be inaccessible in a restricted browser context.
  }

  try {
    void captureCoreException(error, { source, ...(url ? { url } : {}) }).catch(() => undefined)
  } catch {
    // Reporting failures must never reach Vue or browser error handlers.
  }
}

function installVueHandler(app: App): void {
  if (installedApps.has(app)) return
  const originalHandler = app.config.errorHandler
  app.config.errorHandler = function (this: unknown, error, instance, info) {
    capture(error, 'vue', typeof window === 'undefined' ? undefined : window)
    originalHandler?.call(this, error, instance, info)
  }
  installedApps.add(app)
}

function installBrowserHandlers(browserWindow: Window): void {
  if (installedWindows.has(browserWindow)) return
  browserWindow.addEventListener('error', (event) => {
    capture(event.error ?? event.message, 'window', browserWindow)
  })
  browserWindow.addEventListener('unhandledrejection', (event) => {
    capture(event.reason, 'unhandledrejection', browserWindow)
  })
  installedWindows.add(browserWindow)
}

function isVueApp(value: unknown): value is App {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<App>
  return typeof candidate.use === 'function' && typeof candidate.mount === 'function' && !!candidate.config
}

export function init(options: VueMonitoringInitOptions): ClientState {
  if (!isVueApp(options.app)) throw new TypeError('PMS monitoring init requires a Vue app')

  const { app, ...coreOptions } = options
  const state = initCore({
    ...coreOptions,
    sdk: { name: '@pms/monitoring-vue', version: '0.1.0' },
  })
  const existing = appStates.get(app)
  if (existing) return existing
  appStates.set(app, state)
  installVueHandler(app)
  if (typeof window !== 'undefined') installBrowserHandlers(window)
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

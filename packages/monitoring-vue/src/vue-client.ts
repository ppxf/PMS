import { getClientState as getCoreClientState, init as initCore } from '@pms/monitoring-core'
import type { App } from 'vue'
import type { ClientState, MonitoringInitOptions } from './types.js'

export interface VueMonitoringInitOptions extends MonitoringInitOptions {
  app: App
}

const appStates = new WeakMap<App, ClientState>()

function isVueApp(value: unknown): value is App {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<App>
  return typeof candidate.use === 'function' && typeof candidate.mount === 'function' && !!candidate.config
}

export function init(options: VueMonitoringInitOptions): ClientState {
  if (!isVueApp(options.app)) throw new TypeError('PMS monitoring init requires a Vue app')

  const { app, ...coreOptions } = options
  const state = initCore(coreOptions)
  appStates.set(app, state)
  return state
}

export function getVueClientState(app: App): ClientState | undefined {
  return appStates.get(app)
}

export function getClientState(): ClientState | undefined {
  return getCoreClientState()
}

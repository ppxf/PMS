import { parseDsn } from './dsn.js'
import { NoopTransport } from './types.js'
import type { ClientState, MonitoringInitOptions, Transport } from './types.js'

let state: ClientState | undefined
let activeTransport: Transport | undefined
const defaultTransport = new NoopTransport()

export function init(options: MonitoringInitOptions): ClientState {
  const parsed = parseDsn(options.dsn)
  const nextTransport = options.transport ?? defaultTransport
  const next: ClientState = {
    initialized: true,
    ...parsed,
    ...(options.environment ? { environment: options.environment } : {}),
    ...(options.release ? { release: options.release } : {}),
  }

  if (state) {
    if (JSON.stringify(state) === JSON.stringify(next) && activeTransport === nextTransport) return state
    throw new Error('PMS monitoring client is already initialized with different options')
  }

  state = Object.freeze(next)
  activeTransport = nextTransport
  return state
}

export function getClientState(): ClientState | undefined {
  return state
}

export function getTransport(): Transport | undefined {
  return activeTransport
}

/** @internal Test isolation; not exported from the package public entrypoint. */
export function resetClientForTests(): void {
  state = undefined
  activeTransport = undefined
}

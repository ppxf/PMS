import { parseDsn } from './dsn.js'
import { createEvent, truncate } from './event.js'
import { HttpTransport } from './http-transport.js'
import type { CaptureExceptionContext, ClientState, MonitoringEnvelope, MonitoringInitOptions, Transport } from './types.js'

let state: ClientState | undefined
let activeTransport: Transport | undefined
let activeFetcher: typeof globalThis.fetch | undefined

function sendEnvelope(envelope: MonitoringEnvelope): Promise<void> {
  try {
    return Promise.resolve(activeTransport?.send(envelope)).then(() => undefined, () => undefined)
  } catch {
    return Promise.resolve()
  }
}

export function init(options: MonitoringInitOptions): ClientState {
  const parsed = parseDsn(options.dsn)
  const fetcher = options.fetch ?? globalThis.fetch
  const next: ClientState = {
    initialized: true,
    ...parsed,
    ...(options.environment ? { environment: options.environment } : {}),
    ...(options.release ? { release: options.release } : {}),
  }

  if (state) {
    if (JSON.stringify(state) === JSON.stringify(next) &&
      (options.transport ? activeTransport === options.transport : activeFetcher === fetcher)) return state
    throw new Error('PMS monitoring client is already initialized with different options')
  }

  state = Object.freeze(next)
  activeTransport = options.transport ?? new HttpTransport(parsed.endpoint, parsed.publicKey, fetcher)
  activeFetcher = options.transport ? undefined : fetcher
  void sendEnvelope({
    version: 1,
    type: 'client_report',
    sentAt: new Date().toISOString(),
    sdk: { name: '@pms/monitoring-core', version: '0.1.0' },
    ...(options.environment ? { environment: truncate(options.environment, 128) } : {}),
    ...(options.release ? { release: truncate(options.release, 128) } : {}),
  })
  return state
}

export function captureException(
  error: unknown,
  context: CaptureExceptionContext = {},
): Promise<void> {
  if (!state) return Promise.resolve()
  const event = createEvent(error, context, state)
  return sendEnvelope({ version: 1, type: 'event', sentAt: new Date().toISOString(), event })
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
  activeFetcher = undefined
}

import { parseDsn } from './dsn.js'
import { createEvent, truncate } from './event.js'
import { HttpTransport, TransportError } from './http-transport.js'
import type { CaptureExceptionContext, ClientState, MonitoringEnvelope, MonitoringInitOptions, Transport } from './types.js'

let state: ClientState | undefined
let activeTransport: Transport | undefined
let activeFetcher: typeof globalThis.fetch | undefined
let activeSdk: MonitoringInitOptions['sdk'] | undefined
let activeDebug = false
let activeOnTransportError: MonitoringInitOptions['onTransportError']

const defaultSdk = { name: '@pms/monitoring-core', version: '0.1.0' } as const

function reportCallbackFailure(): void {
  if (activeDebug) {
    console.warn('[PMS Monitoring] Transport error callback failed')
  }
}

function reportTransportError(error: unknown, envelope: MonitoringEnvelope): void {
  if (activeDebug) {
    const status = error instanceof TransportError &&
      typeof error.status === 'number' && Number.isFinite(error.status)
      ? error.status
      : undefined
    const message = error instanceof TransportError
      ? status === undefined
        ? 'PMS telemetry network request failed'
        : `PMS telemetry request failed with HTTP ${status}`
      : 'Custom transport failed'
    console.warn('[PMS Monitoring] Transport failed', {
      envelopeType: envelope.type,
      message,
      ...(status === undefined ? {} : { status }),
    })
  }

  if (!activeOnTransportError) return
  try {
    void Promise.resolve(activeOnTransportError(error, envelope)).catch(reportCallbackFailure)
  } catch {
    reportCallbackFailure()
  }
}

async function sendEnvelope(envelope: MonitoringEnvelope): Promise<void> {
  try {
    await activeTransport?.send(envelope)
  } catch (error) {
    reportTransportError(error, envelope)
  }
}

export function init(options: MonitoringInitOptions): ClientState {
  const parsed = parseDsn(options.dsn)
  const fetcher = options.fetch ?? globalThis.fetch
  const sdk = options.sdk ?? defaultSdk
  const next: ClientState = {
    initialized: true,
    ...parsed,
    ...(options.environment ? { environment: options.environment } : {}),
  }

  if (state) {
    if (JSON.stringify(state) === JSON.stringify(next) &&
      (options.transport ? activeTransport === options.transport : activeFetcher === fetcher) &&
      activeDebug === (options.debug ?? false) &&
      activeOnTransportError === options.onTransportError &&
      activeSdk?.name === sdk.name && activeSdk.version === sdk.version) return state
    throw new Error('PMS monitoring client is already initialized with different options')
  }

  state = Object.freeze(next)
  activeTransport = options.transport ?? new HttpTransport(parsed.endpoint, parsed.publicKey, fetcher)
  activeFetcher = options.transport ? undefined : fetcher
  activeSdk = Object.freeze({ ...sdk })
  activeDebug = options.debug ?? false
  activeOnTransportError = options.onTransportError
  void sendEnvelope({
    version: 1,
    type: 'client_report',
    sentAt: new Date().toISOString(),
    sdk: activeSdk,
    ...(options.environment ? { environment: truncate(options.environment, 128) } : {}),
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
  activeSdk = undefined
  activeDebug = false
  activeOnTransportError = undefined
}

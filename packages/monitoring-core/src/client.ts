import { parseDsn } from './dsn.js'
import { createEvent, truncate } from './event.js'
import { HttpTransport, TransportError } from './http-transport.js'
import { createTracing } from './tracing.js'
import { createMetrics } from './metrics.js'
import { createLogs } from './logs.js'
import { normalizePropagationTargets } from './propagation.js'
import type { CaptureExceptionContext, ClientState, MonitoringEnvelope, MonitoringInitOptions, Transport } from './types.js'

export function createMonitoringClient() {
  const tracing = createTracing()
  const metricRecorder = createMetrics()
  const logs = createLogs()
  let activeLogs = false
  let activeBeforeSendLog: MonitoringInitOptions['beforeSendLog']
  let activeMetrics = false
  let activeSampleRate = 0
  let activeRelease: string | undefined
  let activePropagationTargets: readonly string[] = []
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

  function init(options: MonitoringInitOptions): ClientState {
    const propagationTargets = normalizePropagationTargets(options.propagationTargets)
    if (options.tracesSampleRate !== undefined && (!Number.isFinite(options.tracesSampleRate) || options.tracesSampleRate < 0 || options.tracesSampleRate > 1)) throw new TypeError('tracesSampleRate must be between 0 and 1')
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
        activeSdk?.name === sdk.name && activeSdk.version === sdk.version &&
        activeLogs === (options.enableLogs ?? false) && activeBeforeSendLog === options.beforeSendLog &&
        activeMetrics === (options.enableMetrics ?? false) && activeSampleRate === (options.tracesSampleRate ?? 0) && activeRelease === options.release &&
        JSON.stringify(activePropagationTargets) === JSON.stringify(propagationTargets)) return state
      throw new Error('PMS monitoring client is already initialized with different options')
    }

    state = Object.freeze(next)
    activeTransport = options.transport ?? new HttpTransport(parsed.endpoint, parsed.publicKey, fetcher)
    activeFetcher = options.transport ? undefined : fetcher
    activeSdk = Object.freeze({ ...sdk })
    activeDebug = options.debug ?? false
    activeOnTransportError = options.onTransportError
    activeSampleRate = options.tracesSampleRate ?? 0
    activeRelease = options.release
    activePropagationTargets = propagationTargets
    const report: MonitoringEnvelope = {
      version: 1,
      type: 'client_report',
      sentAt: new Date().toISOString(),
      sdk: activeSdk,
      ...(options.environment ? { environment: truncate(options.environment, 128) } : {}),
      ...(options.propagationTargets === undefined ? {} : { propagationTargets }),
    }
    tracing.configure(options, activeTransport)
    activeMetrics = options.enableMetrics ?? false
    metricRecorder.configure({ ...options }, activeTransport)
    activeLogs = options.enableLogs ?? false
    activeBeforeSendLog = options.beforeSendLog
    logs.configure({ ...options }, activeTransport)
    void sendEnvelope(report)
    return state
  }

  function captureException(
    error: unknown,
    context: CaptureExceptionContext = {},
  ): Promise<void> {
    if (!state) return Promise.resolve()
    const event = createEvent(error, context, state)
    return sendEnvelope({ version: 1, type: 'event', sentAt: new Date().toISOString(), event })
  }

  function getClientState(): ClientState | undefined {
    return state
  }

  function getTransport(): Transport | undefined {
    return activeTransport
  }
  function getPropagationTargets(): readonly string[] { return activePropagationTargets }

  /** @internal Test isolation; not exported from the package public entrypoint. */
  function resetClientForTests(): void {
    tracing.reset()
    metricRecorder.reset()
    logs.reset()
    activeLogs = false
    activeBeforeSendLog = undefined
    activeMetrics = false
    state = undefined
    activeTransport = undefined
    activeFetcher = undefined
    activeSdk = undefined
    activeDebug = false
    activeOnTransportError = undefined
    activeSampleRate = 0
    activeRelease = undefined
    activePropagationTargets = []
  }

  return { init, captureException, getClientState, getTransport, getPropagationTargets, resetClientForTests,
    metrics: metricRecorder.metrics, getMetricStats: metricRecorder.getMetricStats,
    logger: logs.logger, getLogStats: logs.getLogStats, captureConsoleLogs: logs.captureConsoleLogs,
    startSpan: tracing.startSpan, startInactiveSpan: tracing.startInactiveSpan,
    flush: async () => { await Promise.all([tracing.flush(), metricRecorder.flush(), logs.flush()]) }, getTraceStats: tracing.getTraceStats }
}

const defaultClient = createMonitoringClient()
export const { init, captureException, getClientState, getTransport, resetClientForTests, startSpan, startInactiveSpan, flush, getTraceStats, metrics, getMetricStats, logger, getLogStats, captureConsoleLogs } = defaultClient

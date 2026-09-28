export type MonitoringEventType = 'error'
export type MonitoringLevel = 'error'
export type MonitoringEventSource = 'vue' | 'window' | 'unhandledrejection' | 'manual'

export interface MonitoringException {
  type: string
  value: string
  stacktrace?: string
}

export interface MonitoringEvent {
  eventId: string
  timestamp: string
  type: 'error'
  level: 'error'
  source: MonitoringEventSource
  message: string
  exception: MonitoringException
  url?: string
  environment?: string
  release?: string
  tags?: Record<string, string>
}

export interface MonitoringSdkMetadata {
  name: string
  version: string
}

export interface ClientReportEnvelope {
  version: 1
  type: 'client_report'
  sentAt: string
  sdk: MonitoringSdkMetadata
  environment?: string
  release?: string
}

export interface EventEnvelope {
  version: 1
  type: 'event'
  sentAt: string
  event: MonitoringEvent
}

export type MonitoringEnvelope = ClientReportEnvelope | EventEnvelope

export interface Transport {
  send(envelope: MonitoringEnvelope): Promise<void>
}

export class NoopTransport implements Transport {
  send(envelope: MonitoringEnvelope): Promise<void> {
    void envelope
    return Promise.resolve()
  }
}

export interface CaptureExceptionContext {
  source?: MonitoringEventSource
  url?: string
  tags?: Record<string, string>
}

export interface MonitoringInitOptions {
  dsn: string
  debug?: boolean
  environment?: string
  onTransportError?: (error: unknown, envelope: MonitoringEnvelope) => void | Promise<void>
  release?: string
  transport?: Transport
  fetch?: typeof globalThis.fetch
  sdk?: MonitoringSdkMetadata
}

export interface ClientState {
  initialized: true
  dsn: string
  endpoint: string
  publicKey: string
  projectId: string
  environment?: string
  release?: string
}

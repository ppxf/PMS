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
  type: MonitoringEventType
  level: MonitoringLevel
  source: MonitoringEventSource
  message: string
  exception: MonitoringException
  url?: string
  environment?: string
  release?: string
  tags?: Record<string, string>
}

export interface ClientReportEnvelope {
  version: 1
  type: 'client_report'
  sentAt: string
  sdk: { name: '@pms/monitoring-vue'; version: '0.1.0' }
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

export interface MonitoringInitOptions {
  dsn: string
  environment?: string
  release?: string
  transport?: Transport
  fetch?: typeof globalThis.fetch
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

export type MonitoringEventType = 'error' | 'message'
export type MonitoringLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug'

export interface MonitoringException {
  type: string
  value: string
  stacktrace?: string
}

export interface MonitoringEvent {
  eventId: string
  timestamp: string
  type: MonitoringEventType
  level?: MonitoringLevel
  message?: string
  exception?: MonitoringException
  url?: string
  environment?: string
  release?: string
  tags?: Record<string, string>
}

export interface Transport {
  send(event: MonitoringEvent): Promise<void>
}

export interface MonitoringInitOptions {
  dsn: string
  environment?: string
  release?: string
  transport?: Transport
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

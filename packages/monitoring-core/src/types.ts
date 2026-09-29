export type MonitoringEventType = 'error'
export type MonitoringLevel = 'error'
export type MonitoringEventSource = 'vue' | 'window' | 'unhandledrejection' | 'manual'

export interface MonitoringException {
  type: string
  value: string
  stacktrace?: string
}

export interface RequestContext {
  headers: Record<string, string>
  cookies: Record<string, string>
}

export interface BrowserContext {
  name?: string
  version?: string
  userAgent?: string
}

export interface OperatingSystemContext { name?: string }

export interface DeviceContext {
  platform?: string
  screenWidth?: number
  screenHeight?: number
  viewportWidth?: number
  viewportHeight?: number
  pixelRatio?: number
}

export interface CultureContext {
  locale?: string
  languages?: string[]
  timezone?: string
}

export interface MemoryContext {
  usedJSHeapSize?: number
  totalJSHeapSize?: number
  jsHeapSizeLimit?: number
  deviceMemoryGiB?: number
}

export interface BrowserEventContexts {
  request?: RequestContext
  browser?: BrowserContext
  os?: OperatingSystemContext
  device?: DeviceContext
  culture?: CultureContext
  memory?: MemoryContext
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
  tags?: Record<string, string>
  contexts?: BrowserEventContexts
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
  tags?: Record<string, string>
}

export interface MonitoringInitOptions {
  dsn: string
  debug?: boolean
  environment?: string
  onTransportError?: (error: unknown, envelope: MonitoringEnvelope) => void | Promise<void>
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
}

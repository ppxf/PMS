export { captureException, getClientState, getVueClientState, init, startSpan, startInactiveSpan, flush, getTraceStats } from './vue-client.js'
export type { MonitoringSpan, SpanHandle, SpanOptions, TraceContext } from '@pms/monitoring-core'
export type { VueMonitoringInitOptions } from './vue-client.js'
export { HttpTransport, NoopTransport, TransportError } from '@pms/monitoring-core'
export type {
  ClientState,
  ClientReportEnvelope,
  EventEnvelope,
  MonitoringEvent,
  MonitoringEnvelope,
  MonitoringEventSource,
  MonitoringEventType,
  MonitoringInitOptions,
  MonitoringException,
  MonitoringLevel,
  Transport,
} from '@pms/monitoring-core'

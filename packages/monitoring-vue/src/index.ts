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
export { metrics, getMetricStats } from './vue-client.js'
export type { MetricType, MetricOptions, MetricSample, MetricsEnvelope } from '@pms/monitoring-core'
export { logger, getLogStats, captureConsoleLogs } from './vue-client.js'
export type { LogLevel, LogEntry, LogAttributes, LogContext, LogsEnvelope, FormattedLog, ConsoleLogMethod } from '@pms/monitoring-core'

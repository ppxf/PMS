export type SpanStatus = 'ok' | 'error' | 'cancelled' | 'deadline_exceeded' | 'unknown'
export interface TraceContext { traceId: string; spanId: string; sampled: boolean }
export interface MonitoringSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  isTransaction: boolean
  op: string
  name: string
  startTime: string
  endTime: string
  durationMs: number
  status: SpanStatus
  environment?: string
  release?: string
  pageRoute?: string
  httpMethod?: string
  httpStatusCode?: number
  httpRoute?: string
  ttfbMs?: number
  transferSize?: number
  encodedBodySize?: number
  decodedBodySize?: number
  truncated: boolean
  endReason: string
  droppedSpanCount: number
  attributes: Record<string, string | number | boolean>
}
export interface TransactionEnvelope {
  version: 1
  type: 'transaction'
  sentAt: string
  transaction: { eventId: string; spans: MonitoringSpan[] }
}
export interface SpanOptions {
  name: string
  op?: string
  parent?: SpanHandle | TraceContext
  attributes?: Record<string, string | number | boolean>
  pageRoute?: string
  startTime?: number
}
export interface SpanHandle {
  readonly context: TraceContext
  readonly span: MonitoringSpan
  readonly ended: boolean
  end(status?: SpanStatus, reason?: string): void
  setAttribute(key: string, value: string | number | boolean): void
  setMeasurements(values: Partial<Pick<MonitoringSpan, 'ttfbMs' | 'transferSize' | 'encodedBodySize' | 'decodedBodySize' | 'httpMethod' | 'httpRoute' | 'httpStatusCode'>>): void
}

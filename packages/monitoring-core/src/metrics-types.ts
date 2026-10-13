import type { TraceContext } from './tracing-types.js'
export type MetricType = 'count' | 'gauge' | 'distribution'
export interface MetricOptions {
  unit?: string
  attributes?: Record<string, string | number | boolean>
  traceContext?: TraceContext
}
export interface MetricSample {
  name: string
  type: MetricType
  value: number
  unit: string
  timestamp: string
  attributes: Record<string, string | number | boolean>
  environment?: string
  release?: string
  traceId?: string
  spanId?: string
}
export interface MetricsEnvelope {
  version: 1
  type: 'metrics'
  sentAt: string
  eventId: string
  samples: MetricSample[]
}

export type MetricType = 'count' | 'gauge' | 'distribution'
export type MetricAggregation =
  'sum' | 'avg' | 'min' | 'max' | 'count' | 'p50' | 'p95' | 'p99' | 'last'
export interface MetricIdentity {
  name: string
  type: MetricType
  unit: string
}
export interface MetricCatalog {
  items: (MetricIdentity & { sampleCount: number; lastSeen: string })[]
  attributes: string[]
  enabled: boolean
  truncated: boolean
}
export interface MetricQuery extends MetricIdentity {
  start: string
  end: string
  aggregation: MetricAggregation
  environment?: string
  filters: { key: string; value: string | number | boolean }[]
  groupBy?: string
  intervalSeconds?: number
  page: number
  pageSize: number
}
export interface MetricResult {
  total: number
  page: number
  pageSize: number
  intervalMs: number
  truncatedGroups: boolean
  samples: (MetricIdentity & {
    eventId: string
    sampleIndex: number
    value: number
    timestamp: string
    attributes: Record<string, string | number | boolean>
    traceId?: string
    spanId?: string
    environment?: string
  })[]
  aggregates: { groupValue: unknown; value: number; sampleCount: number }[]
  series: {
    groupValue: unknown
    points: { timestamp: string; value: number | null; sampleCount: number }[]
  }[]
}
export function metricGroupLabel(value: unknown): string {
  return value === null || value === undefined
    ? '(无属性)'
    : typeof value === 'string'
      ? value
      : JSON.stringify(value)
}
export function metricCsv(result: MetricResult): string {
  const cell = (value: unknown) => {
    let text = typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value)
    if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`
    return `"${text.replace(/"/g, '""')}"`
  }
  return [
    ['timestamp', 'name', 'type', 'unit', 'value', 'environment', 'traceId', 'attributes'],
    ...result.samples.map((s) => [
      s.timestamp,
      s.name,
      s.type,
      s.unit,
      s.value,
      s.environment,
      s.traceId,
      s.attributes,
    ]),
  ]
    .map((row) => row.map(cell).join(','))
    .join('\r\n')
}

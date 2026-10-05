export type MetricFunction = 'count' | 'avg' | 'p50' | 'p95' | 'errorRate'
export interface TraceMetric {
  function: MetricFunction
  field: string
}
export interface TraceFilter {
  field: string
  operator: 'eq' | 'in' | 'not_in' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists'
  value?: unknown
}
export interface TraceQuery {
  start: string
  end: string
  filters: TraceFilter[]
  metrics: TraceMetric[]
  groupBy: string[]
  primaryMetric: number
  limit: number
  interval?: 'auto' | '1m' | '30m' | '1h' | '3h' | '6h' | '1d'
  page?: number
  pageSize?: number
  sortBy?: string | number
  sortDirection?: 'asc' | 'desc'
}
export interface Span {
  traceId: string
  spanId: string
  parentSpanId?: string | null
  isTransaction: boolean
  op: string
  name: string
  startTime: string
  endTime: string
  durationMs: number
  status: string
  environment?: string
  release?: string
  pageRoute?: string
  httpMethod?: string
  httpStatusCode?: number
  httpRoute?: string
  ttfbMs?: number | null
  transferSize?: number | null
  encodedBodySize?: number | null
  decodedBodySize?: number | null
  truncated: boolean
  endReason: string
  droppedSpanCount: number
  attributes: Record<string, unknown>
}
export interface TraceSample {
  traceId: string
  startTime: string
  endTime: string
  spanCount: number
  durationMs: number
  truncated: boolean
}
export interface TracePage<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
export interface TraceSeries {
  intervalMs: number
  groups: { key: string; values: unknown[] }[]
  series: {
    groupKey: string
    metricIndex: number
    points: { timestamp: string; value: number | null; sampleCount: number }[]
  }[]
  sampleCount: number
}
export interface TraceAggregates {
  items: {
    groupKey: string
    groupValues: unknown[]
    values: (number | null)[]
    sampleCounts: number[]
  }[]
  sampleCount: number
}
export interface TraceField {
  name: string
  type: string
  unit?: string
  operators: string[]
  groupable: boolean
  aggregations: string[]
}
export const metricFields = [
  'span.duration',
  'http.request.time_to_first_byte',
  'http.response_transfer_size',
  'http.response_content_length',
  'http.decoded_response_content_length',
]
export const groupFields = [
  'is_transaction',
  'span.op',
  'span.name',
  'http.method',
  'http.route',
  'http.status_code',
  'http.status_class',
  'http.instrumentation',
  'environment',
  'release',
]
export function matchesSpanFilters(span: Span, filters: TraceFilter[]): boolean {
  const values: Record<string, unknown> = {
    'span.op': span.op,
    'span.name': span.name,
    'span.duration': span.durationMs,
    is_transaction: span.isTransaction,
    'http.method': span.httpMethod,
    'http.route': span.httpRoute,
    'http.status_code': span.httpStatusCode,
    'http.status_class':
      span.httpStatusCode != null && span.httpStatusCode >= 100 && span.httpStatusCode <= 599
        ? `${Math.floor(span.httpStatusCode / 100)}xx`
        : 'unknown',
    'http.instrumentation': span.attributes['http.instrumentation'],
    environment: span.environment,
    release: span.release,
    'span.status': span.status,
    'span.truncated': span.truncated,
    'page.route': span.pageRoute,
    'http.request.time_to_first_byte': span.ttfbMs,
    'http.response_transfer_size': span.transferSize,
    'http.response_content_length': span.encodedBodySize,
    'http.decoded_response_content_length': span.decodedBodySize,
  }
  return filters.every((filter) => {
    const value = values[filter.field]
    const wanted = filter.value
    switch (filter.operator) {
      case 'exists':
        return filter.value === false ? value == null : value != null
      case 'eq':
        return value === wanted
      case 'in':
        return Array.isArray(wanted) && wanted.includes(value)
      case 'not_in':
        return Array.isArray(wanted) && !wanted.includes(value)
      case 'contains':
        return typeof value === 'string' && typeof wanted === 'string' && value.includes(wanted)
      case 'gt':
        return typeof value === 'number' && typeof wanted === 'number' && value > wanted
      case 'gte':
        return typeof value === 'number' && typeof wanted === 'number' && value >= wanted
      case 'lt':
        return typeof value === 'number' && typeof wanted === 'number' && value < wanted
      case 'lte':
        return typeof value === 'number' && typeof wanted === 'number' && value <= wanted
      default:
        return false
    }
  })
}
export function metricUnit(metric: TraceMetric): string {
  return metric.function === 'count'
    ? 'spans'
    : metric.function === 'errorRate'
      ? '%'
      : metric.field.includes('size') || metric.field.includes('length')
        ? 'byte'
        : 'ms'
}
export function formatMetric(value: number | null | undefined, metric: TraceMetric): string {
  return value == null
    ? '—'
    : `${(metric.function === 'errorRate' ? value * 100 : value).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${metricUnit(metric)}`
}
export function waterfallRows(
  spans: Span[],
): { span: Span; depth: number; missingParent: boolean }[] {
  const ids = new Set(spans.map((s) => s.spanId))
  const visited = new Set<string>()
  const rows: ReturnType<typeof waterfallRows> = []
  const sorted = [...spans].sort(
    (a, b) => a.startTime.localeCompare(b.startTime) || a.spanId.localeCompare(b.spanId),
  )
  function visit(span: Span, depth: number) {
    if (visited.has(span.spanId)) return
    visited.add(span.spanId)
    rows.push({
      span,
      depth,
      missingParent: Boolean(span.parentSpanId && !ids.has(span.parentSpanId)),
    })
    for (const child of sorted.filter((s) => s.parentSpanId === span.spanId))
      visit(child, depth + 1)
  }
  for (const span of sorted.filter((s) => !s.parentSpanId || !ids.has(s.parentSpanId)))
    visit(span, 0)
  for (const span of sorted) visit(span, 0)
  return rows
}
export function presetQuery(name: string): Pick<TraceQuery, 'filters' | 'metrics' | 'groupBy'> {
  const http: TraceFilter[] = [
    { field: 'span.op', operator: 'eq', value: 'http.client' },
    { field: 'http.instrumentation', operator: 'eq', value: 'fetch' },
  ]
  if (name === 'all')
    return {
      filters: [],
      metrics: [{ function: 'count', field: 'spans' }],
      groupBy: ['is_transaction'],
    }
  if (name === 'pages')
    return {
      filters: [
        { field: 'is_transaction', operator: 'eq', value: true },
        { field: 'span.op', operator: 'in', value: ['pageload', 'navigation'] },
      ],
      metrics: [{ function: 'p95', field: 'span.duration' }],
      groupBy: ['span.name'],
    }
  if (name === 'versions')
    return {
      filters: [
        { field: 'span.op', operator: 'eq', value: 'pageload' },
        { field: 'is_transaction', operator: 'eq', value: true },
      ],
      metrics: [{ function: 'p95', field: 'span.duration' }],
      groupBy: ['release'],
    }
  const field =
    name === 'ttfb' ? metricFields[1]! : name === 'sizes' ? metricFields[3]! : metricFields[0]!
  return {
    filters: [
      ...http,
      ...(name === 'ttfb' || name === 'sizes' ? [{ field, operator: 'exists' as const }] : []),
    ],
    metrics: [
      {
        function: name === 'requests' || name === 'statuses' ? 'count' : 'p95',
        field: name === 'requests' || name === 'statuses' ? 'spans' : field,
      },
    ],
    groupBy: name === 'statuses' ? ['http.status_class'] : ['http.method', 'http.route'],
  }
}

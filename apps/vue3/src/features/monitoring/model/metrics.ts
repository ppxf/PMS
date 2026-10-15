export type MetricType = 'count' | 'gauge' | 'distribution'
export type MetricAggregation =
  'sum' | 'avg' | 'min' | 'max' | 'count' | 'p50' | 'p95' | 'p99' | 'last'
const aggregations: Record<MetricType, MetricAggregation[]> = {
  count: ['sum', 'count'],
  gauge: ['last', 'avg', 'min', 'max', 'count'],
  distribution: ['p95', 'p50', 'p99', 'avg', 'min', 'max', 'sum', 'count'],
}
export const metricAggregations = (type: MetricType): readonly MetricAggregation[] =>
  aggregations[type]
export const defaultMetricAggregation = (type: MetricType): MetricAggregation =>
  type === 'count' ? 'sum' : type === 'gauge' ? 'last' : 'p95'
export const metricTypeLabel = (type: MetricType) => (type === 'count' ? 'counter' : type)
export const metricAggregationLabel = (aggregation: MetricAggregation, type: MetricType) =>
  aggregation === 'sum' && type === 'count'
    ? 'sum · Total events'
    : aggregation === 'count'
      ? 'count · Sample count'
      : aggregation === 'last'
        ? 'last · Latest value'
        : aggregation
export interface MetricGroupField {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'mixed'
}
export const metricGroupFields: MetricGroupField[] = [
  ...['client.address', 'project', 'sdk.name', 'sdk.version', 'user_agent.original'].map((key) => ({
    key,
    label: key,
    type: 'string' as const,
  })),
  { key: 'value', label: 'value', type: 'number' },
  ...['browser.name', 'browser.version'].map((key) => ({
    key,
    label: key,
    type: 'string' as const,
  })),
]
export const catalogGroupFields = (catalog: MetricCatalog | null): MetricGroupField[] =>
  catalog?.groupFields ?? [
    ...metricGroupFields,
    ...(catalog?.attributes ?? [])
      .filter(
        (key) =>
          ['value', 'project'].includes(key) ||
          !metricGroupFields.some((field) => field.key === key),
      )
      .map((key) => ({
        key: `attributes.${key}`,
        label: ['value', 'project'].includes(key) ? `attributes.${key}` : key,
        type: 'string' as const,
      })),
  ]
export interface MetricIdentity {
  name: string
  type: MetricType
  unit: string
}
export interface MetricCatalog {
  items: (MetricIdentity & { sampleCount: number; lastSeen: string })[]
  attributes: string[]
  groupFields?: MetricGroupField[]
  filterFields?: MetricFilterField[]
  truncatedAttributes?: boolean
  enabled: boolean
  truncated: boolean
}
export interface MetricQuery extends MetricIdentity {
  traceId?: string
  spanId?: string
  start: string
  end: string
  aggregation: MetricAggregation
  filters: MetricFilter[]
  groupBy?: string | string[]
  intervalSeconds?: number
  page: number
  pageSize: number
}
export type MetricFilterOperator =
  'eq' | 'in' | 'not_in' | 'contains' | 'exists' | 'gt' | 'gte' | 'lt' | 'lte'
export type MetricScalar = string | number | boolean
export interface MetricFilter {
  field: string
  operator: MetricFilterOperator
  value?: MetricScalar | MetricScalar[]
}
export interface MetricFilterField extends MetricGroupField {
  operators: MetricFilterOperator[]
}
export function metricFieldOperators(type: MetricGroupField['type']): MetricFilterOperator[] {
  return [
    'eq',
    'in',
    'not_in',
    ...(type === 'string' || type === 'mixed' ? ['contains' as const] : []),
    ...(type === 'number' || type === 'mixed' ? (['gt', 'gte', 'lt', 'lte'] as const) : []),
    'exists',
  ]
}
export function catalogFilterFields(catalog: MetricCatalog | null): MetricFilterField[] {
  if (catalog?.filterFields) return catalog.filterFields
  const native: MetricGroupField[] = [
    'name',
    'type',
    'unit',
    'environment',
    'release',
    'traceId',
    'spanId',
  ].map((key) => ({ key, label: key, type: 'string' }))
  return [...native, ...catalogGroupFields(catalog)].map((field) => ({
    ...field,
    label: field.key.startsWith('attributes.') ? field.key : field.label,
    operators: metricFieldOperators(field.type),
  }))
}
export function buildMetricFilter(
  field: MetricFilterField,
  operator: MetricFilterOperator,
  input: string,
): MetricFilter {
  if (!field.operators.includes(operator))
    throw new Error('This field does not support the selected operator')
  if (operator === 'exists')
    return { field: field.key, operator, ...(input === 'false' ? { value: false } : {}) }
  const parse = (raw: string): MetricScalar => {
    const text = raw.trim()
    if (!text) throw new Error('Enter a filter value')
    let value: unknown = text
    if (field.type === 'number' || ['gt', 'gte', 'lt', 'lte'].includes(operator)) {
      value = Number(text)
      if (!Number.isFinite(value) || Math.abs(Number(value)) > Number.MAX_SAFE_INTEGER)
        throw new Error('Enter a valid number')
    } else if (field.type === 'boolean') {
      if (text !== 'true' && text !== 'false')
        throw new Error('Boolean values must be true or false')
      value = text === 'true'
    } else if ((field.type === 'mixed' && operator !== 'contains') || text.startsWith('"')) {
      try {
        value = JSON.parse(text)
      } catch {
        value = text
      }
    }
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
      throw new Error('Enter text, a number, or a boolean value')
    if (
      typeof value === 'number' &&
      (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)
    )
      throw new Error('Enter a valid number')
    if (typeof value === 'string' && value.length > 256)
      throw new Error('Filter values must not exceed 256 characters')
    return value
  }
  const value =
    operator === 'in' || operator === 'not_in' ? input.split(',').map(parse) : parse(input)
  if (Array.isArray(value) && value.length > 50) throw new Error('Enter no more than 50 values')
  return { field: field.key, operator, value }
}
export interface TraceMetricsQuery {
  page: number
  pageSize: number
  search?: string
  spanId?: string
}
export interface TraceMetricsResult {
  total: number
  page: number
  pageSize: number
  samples: MetricResult['samples']
}
export interface MetricResult {
  aggregation?: MetricAggregation
  unit?: string
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
    release?: string
  })[]
  aggregates: { groupValue: unknown; value: number; sampleCount: number }[]
  series: {
    groupValue: unknown
    points: { timestamp: string; value: number | null; sampleCount: number }[]
  }[]
}
export function metricGroupLabel(value: unknown): string {
  if (Array.isArray(value)) return value.map(metricGroupLabel).join(' / ')
  return value === null || value === undefined
    ? '(No value)'
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

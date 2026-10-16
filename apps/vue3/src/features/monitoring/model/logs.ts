export type LogScalar = string | number | boolean
export interface LogCondition {
  key: string
  operator:
    | 'eq'
    | 'neq'
    | 'in'
    | 'not_in'
    | 'contains'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'exists'
    | 'not_exists'
  value?: LogScalar | LogScalar[]
}
export const LOG_AGGREGATES = [
  'count',
  'count_unique',
  'sum',
  'avg',
  'p50',
  'p75',
  'p90',
  'p95',
  'p99',
  'max',
  'min',
] as const
export interface LogVisualization {
  aggregate: (typeof LOG_AGGREGATES)[number]
  field: string
  groupBy?: string[]
  conditions?: LogCondition[]
}
export function logVisualizationTitle(visualization: LogVisualization): string {
  const { aggregate, field, conditions = [] } = visualization
  const label = field || 'Select a field'
  if (!conditions.length) return `${aggregate}(${label})`
  const operators = { gt: '>', gte: '>=', lt: '<', lte: '<=' }
  const expression = conditions
    .map(({ key, operator, value }) => {
      if (operator === 'exists') return `has:${key}`
      if (operator === 'not_exists') return `!has:${key}`
      if (operator === 'contains') return `${key}:*${JSON.stringify(`${String(value)}*`)}`
      if (operator === 'eq') return `${key}:${JSON.stringify(value)}`
      if (operator === 'neq') return `!${key}:${JSON.stringify(value)}`
      if (operator === 'in' || operator === 'not_in')
        return `${key}:${operator}:${JSON.stringify(value)}`
      return `${key}:${operators[operator]}${JSON.stringify(value)}`
    })
    .join(' ')
  return `${aggregate}_if(\`${expression}\`, ${label})`
}
export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]
export interface LogEntry {
  payloadSize?: number
  logId: string
  timestamp: string
  level: LogLevel
  message: string
  attributes: Record<string, string | number | boolean>
  environment?: string
  release?: string
  traceId?: string
  spanId?: string
}
export interface LogField {
  key: string
  type: string
  category: string
}
export interface LogFields {
  fields?: LogField[]
  attributes: string[]
  levels: LogLevel[]
  enabled: boolean
  truncated: boolean
  dsn: string
}
export interface LogQuery {
  conditions?: LogCondition[]
  visualizations?: LogVisualization[]
  start: string
  end: string
  search?: string
  levels: LogLevel[]
  environment?: string
  traceId?: string
  filters: { key: string; value: string | number | boolean }[]
  intervalSeconds?: number
  page: number
  pageSize: number
  sortDirection: 'asc' | 'desc'
}
export interface LogResult {
  charts?: {
    title: string
    groups: {
      name: string
      value: number | null
      points: { timestamp: string; value: number | null }[]
    }[]
  }[]
  items: LogEntry[]
  total: number
  page: number
  pageSize: number
  intervalMs: number
  series: { level: LogLevel; points: { timestamp: string; count: number }[] }[]
}
export function logsCsv(items: LogEntry[]): string {
  const cell = (value: unknown) => {
    let text = typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value)
    if (/^\s*[=+@-]/.test(text)) text = `'${text}`
    return `"${text.replace(/"/g, '""')}"`
  }
  return [
    ['timestamp', 'level', 'message', 'environment', 'release', 'traceId', 'spanId', 'attributes'],
    ...items.map((log) => [
      log.timestamp,
      log.level,
      log.message,
      log.environment,
      log.release,
      log.traceId,
      log.spanId,
      log.attributes,
    ]),
  ]
    .map((row) => row.map(cell).join(','))
    .join('\r\n')
}

export function conditionValue(
  raw: string,
  operator: LogCondition['operator'],
  type = 'string',
): LogScalar | LogScalar[] | undefined {
  if (operator === 'exists' || operator === 'not_exists') return undefined
  if (!raw.trim()) throw Error('Enter a value')
  const scalar = (value: unknown): LogScalar => {
    if (!['string', 'number', 'boolean'].includes(typeof value))
      throw Error('Expected a scalar value')
    if (['number', 'size'].includes(type) || ['gt', 'gte', 'lt', 'lte'].includes(operator)) {
      const number = Number(value)
      if (
        typeof value === 'boolean' ||
        !String(value).trim() ||
        !Number.isFinite(number) ||
        Math.abs(number) > Number.MAX_SAFE_INTEGER
      )
        throw Error('Enter a valid number')
      return number
    }
    if (type === 'boolean') {
      if (!['true', 'false'].includes(String(value))) throw Error('Enter true or false')
      return String(value) === 'true'
    }
    if (typeof value === 'string' && value.length > 256)
      throw Error('Maximum 256 characters per value')
    return type === 'mixed' ? (value as LogScalar) : String(value)
  }
  if (operator === 'contains') {
    if (raw.length > 256) throw Error('Maximum 256 characters')
    return raw
  }
  if (operator === 'in' || operator === 'not_in') {
    const json = raw.trim().startsWith('[')
    const values: unknown = json ? JSON.parse(raw) : raw.split(',').map((v) => v.trim())
    if (!Array.isArray(values) || !values.length || values.length > 50)
      throw Error('Enter 1 to 50 values')
    return values.map(scalar)
  }
  if (type === 'mixed') {
    let value: unknown = raw
    try {
      value = JSON.parse(raw)
    } catch {
      /* Treat unquoted text as a string. */
    }
    return scalar(value)
  }
  return scalar(raw)
}

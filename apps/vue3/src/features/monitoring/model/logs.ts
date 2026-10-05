export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]
export interface LogEntry {
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
export interface LogFields {
  attributes: string[]
  levels: LogLevel[]
  enabled: boolean
  truncated: boolean
  dsn: string
}
export interface LogQuery {
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

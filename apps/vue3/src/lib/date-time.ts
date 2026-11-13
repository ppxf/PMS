export interface DateTimeOptions {
  /** Defaults to the browser's local timezone. */
  timeZone?: string
  /** Preserve sub-second precision for trace start/end timestamps. */
  milliseconds?: boolean
}

const formatters = new Map<string, Intl.DateTimeFormat>()

/** Display an ISO timestamp, Date, or Unix timestamp in milliseconds. */
export function formatDateTime(
  value: string | number | Date | null | undefined,
  options: DateTimeOptions = {},
): string {
  if (value == null || (typeof value === 'string' && !value.trim())) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  const key = options.timeZone ?? 'local'
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: options.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    formatters.set(key, formatter)
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  )
  const result = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
  return options.milliseconds
    ? `${result}.${String(date.getUTCMilliseconds()).padStart(3, '0')}`
    : result
}

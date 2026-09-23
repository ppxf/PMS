import type { CaptureExceptionContext, MonitoringEvent } from './types.js'

const MESSAGE_LIMIT = 2_000
const SHORT_LIMIT = 128
const STACK_LIMIT = 65_536
const URL_LIMIT = 2_048

export function truncate(value: string, length: number): string {
  return value.slice(0, length)
}

function truncateStack(value: string): string {
  const bytes = new Uint8Array(STACK_LIMIT)
  const { read, written } = new TextEncoder().encodeInto(value, bytes)
  return read === value.length ? value : new TextDecoder().decode(bytes.subarray(0, written))
}

function safeString(value: unknown): string {
  if (typeof value === 'string') return value

  try {
    const json = JSON.stringify(value)
    if (json !== undefined) return json
  } catch {
    // Circular objects and custom serializers can fail.
  }

  try {
    return String(value)
  } catch {
    return '[unserializable]'
  }
}

function normalizeException(error: unknown): { type: string; value: string; stacktrace?: string } {
  try {
    if (error instanceof Error) {
      return {
        type: truncate(error.name || 'Error', SHORT_LIMIT),
        value: truncate(error.message, MESSAGE_LIMIT),
        ...(error.stack ? { stacktrace: truncateStack(error.stack) } : {}),
      }
    }
  } catch {
    // Hostile objects can throw during prototype or property inspection.
  }

  const type = error === null ? 'Null' : typeof error === 'string' ? 'String' :
    typeof error === 'object' ? 'Object' : typeof error
  return { type: truncate(type, SHORT_LIMIT), value: truncate(safeString(error), MESSAGE_LIMIT) }
}

function normalizeTags(tags: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!tags) return undefined
  const entries = Object.entries(tags).slice(0, 50)
  return Object.fromEntries(entries.map(([key, value]) => [truncate(key, 64), truncate(value, 256)]))
}

export function createEvent(
  error: unknown,
  context: CaptureExceptionContext,
  options: { environment?: string; release?: string },
): MonitoringEvent {
  const exception = normalizeException(error)
  return {
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type: 'error',
    level: 'error',
    source: context.source ?? 'manual',
    message: exception.value,
    exception,
    ...(context.url ? { url: truncate(context.url, URL_LIMIT) } : {}),
    ...(options.environment ? { environment: truncate(options.environment, SHORT_LIMIT) } : {}),
    ...(options.release ? { release: truncate(options.release, SHORT_LIMIT) } : {}),
    ...(context.tags ? { tags: normalizeTags(context.tags) } : {}),
  }
}

import type { TraceContext } from './tracing-types.js'

export function normalizePropagationTargets(targets: readonly string[] = []): readonly string[] {
  if (!Array.isArray(targets) || targets.length > 20) throw new TypeError('propagationTargets must contain at most 20 API URLs or paths')
  return Object.freeze([...new Set(targets.map(target => {
    if (typeof target !== 'string' || target.length > 512 || !target.trim()) throw new TypeError('Invalid propagation target')
    const value = target.trim()
    const url = new URL(value, 'https://pms-relative.invalid')
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash ||
      (!/^https?:\/\//.test(value) && (!value.startsWith('/') || value.startsWith('//')))) throw new TypeError('Propagation targets must be HTTP(S) URLs or absolute paths without credentials/query/hash')
    return /^https?:\/\//.test(value) ? `${url.origin}${url.pathname}` : url.pathname
  }))])
}

export function matchesPropagationTarget(input: string, pageUrl: string, targets: readonly string[]): boolean {
  const url = new URL(input, pageUrl)
  if (!['http:', 'https:'].includes(url.protocol)) return false
  return targets.some(target => {
    const prefix = new URL(target, pageUrl)
    return prefix.origin === url.origin && (url.pathname === prefix.pathname ||
      url.pathname.startsWith(prefix.pathname.endsWith('/') ? prefix.pathname : `${prefix.pathname}/`))
  })
}

export function traceparent(context: TraceContext): string {
  return `00-${context.traceId}-${context.spanId}-${context.sampled ? '01' : '00'}`
}

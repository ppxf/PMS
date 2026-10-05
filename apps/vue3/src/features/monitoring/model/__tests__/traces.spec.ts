import { describe, expect, it } from 'vitest'
import { formatMetric, metricUnit, presetQuery, waterfallRows, matchesSpanFilters } from '../traces'
import type { Span } from '../traces'
const span = (spanId: string, parentSpanId?: string): Span => ({
  traceId: 'trace',
  spanId,
  parentSpanId,
  isTransaction: false,
  op: 'http.client',
  name: spanId,
  startTime: '2026-10-01T00:00:00Z',
  endTime: '2026-10-01T00:00:01Z',
  durationMs: 1000,
  status: 'ok',
  truncated: false,
  endReason: 'completed',
  droppedSpanCount: 0,
  attributes: {},
})
describe('Traces presentation', () => {
  it('matches registry field names and missing-value semantics for detail highlights', () => {
    const item = { ...span('a'), pageRoute: '/home', truncated: true, ttfbMs: null }
    expect(
      matchesSpanFilters(item, [
        { field: 'span.status', operator: 'eq', value: 'ok' },
        { field: 'span.truncated', operator: 'eq', value: true },
        { field: 'page.route', operator: 'eq', value: '/home' },
        { field: 'http.status_class', operator: 'eq', value: 'unknown' },
        { field: 'http.request.time_to_first_byte', operator: 'exists', value: false },
      ]),
    ).toBe(true)
    expect(
      matchesSpanFilters({ ...item, httpStatusCode: 700 }, [
        { field: 'http.status_class', operator: 'eq', value: 'unknown' },
      ]),
    ).toBe(true)
    expect(
      matchesSpanFilters({ ...item, ttfbMs: 0 }, [
        { field: 'http.request.time_to_first_byte', operator: 'exists', value: false },
      ]),
    ).toBe(false)
  })
  it('keeps absent measurements distinct from genuine zero and formats units', () => {
    expect(formatMetric(null, { function: 'p95', field: 'span.duration' })).toBe('—')
    expect(formatMetric(0, { function: 'avg', field: 'http.response_content_length' })).toBe(
      '0 byte',
    )
    expect(formatMetric(0.25, { function: 'errorRate', field: 'spans' })).toBe('25 %')
    expect(metricUnit({ function: 'count', field: 'spans' })).toBe('spans')
  })
  it('builds hierarchy independently of arrival order and identifies missing parents', () => {
    const rows = waterfallRows([span('child', 'root'), span('orphan', 'missing'), span('root')])
    expect(rows.find((r) => r.span.spanId === 'child')?.depth).toBe(1)
    expect(rows.find((r) => r.span.spanId === 'orphan')?.missingParent).toBe(true)
    expect(rows.findIndex((r) => r.span.spanId === 'root')).toBeLessThan(
      rows.findIndex((r) => r.span.spanId === 'child'),
    )
  })
  it('terminates on malformed cycles without dropping records', () => {
    expect(waterfallRows([span('a', 'b'), span('b', 'a')])).toHaveLength(2)
  })
  it('uses unified spans and explicit fetch scope for HTTP comparisons', () => {
    expect(presetQuery('all').filters).toEqual([])
    expect(presetQuery('all').groupBy).toEqual(['is_transaction'])
    expect(presetQuery('slow').filters).toContainEqual({
      field: 'http.instrumentation',
      operator: 'eq',
      value: 'fetch',
    })
    expect(presetQuery('ttfb').filters).toContainEqual({
      field: 'http.request.time_to_first_byte',
      operator: 'exists',
    })
    expect(presetQuery('pages').filters).toContainEqual({
      field: 'is_transaction',
      operator: 'eq',
      value: true,
    })
  })
})

import { describe, expect, it } from 'vitest'
import { conditionValue, logVisualizationTitle } from '../logs'

describe('log visualization titles', () => {
  it('includes independent series conditions and preserves unconditional titles', () => {
    expect(logVisualizationTitle({ aggregate: 'count', field: 'logs' })).toBe('count(logs)')
    expect(
      logVisualizationTitle({
        aggregate: 'count_unique',
        field: 'message',
        conditions: [
          { key: 'message', operator: 'contains', value: 'test' },
          { key: 'message', operator: 'eq', value: 'error log' },
        ],
      }),
    ).toBe('count_unique_if(`message:*"test*" message:"error log"`, message)')
  })
  it('shows numeric, list and existence conditions without dropping their operators', () => {
    expect(
      logVisualizationTitle({
        aggregate: 'sum',
        field: 'payload_size',
        conditions: [
          { key: 'payload_size', operator: 'gte', value: 100 },
          { key: 'severity', operator: 'in', value: ['warn', 'error'] },
          { key: 'trace', operator: 'not_exists' },
        ],
      }),
    ).toBe('sum_if(`payload_size:>=100 severity:in:["warn","error"] !has:trace`, payload_size)')
  })
  it('escapes quoted values and supports the remaining operators', () => {
    const conditions = [
      { key: 'message', operator: 'neq' as const, value: 'say "hi"' },
      { key: 'severity', operator: 'not_in' as const, value: ['info'] },
      { key: 'payload_size', operator: 'gt' as const, value: 1 },
      { key: 'payload_size', operator: 'lt' as const, value: 9 },
      { key: 'payload_size', operator: 'lte' as const, value: 8 },
      { key: 'trace', operator: 'exists' as const },
    ]
    expect(logVisualizationTitle({ aggregate: 'avg', field: 'payload_size', conditions })).toBe(
      'avg_if(`!message:"say \\"hi\\"" severity:not_in:["info"] payload_size:>1 payload_size:<9 payload_size:<=8 has:trace`, payload_size)',
    )
  })
})
describe('log condition values', () => {
  it('preserves mixed scalar types and literal contains text', () => {
    expect(conditionValue('123', 'contains', 'mixed')).toBe('123')
    expect(conditionValue('["123",123,true,"true"]', 'in', 'mixed')).toEqual([
      '123',
      123,
      true,
      'true',
    ])
    expect(conditionValue('"123"', 'eq', 'mixed')).toBe('123')
    expect(conditionValue('123', 'eq', 'mixed')).toBe(123)
    expect(conditionValue('false', 'eq', 'boolean')).toBe(false)
    expect(conditionValue('1, 2', 'in', 'number')).toEqual([1, 2])
  })
  it('rejects invalid scalar and list values', () => {
    for (const raw of ['[]', '[{}]', '[null]', '['])
      expect(() => conditionValue(raw, 'in', 'mixed')).toThrow()
    expect(() => conditionValue('NaN', 'eq', 'number')).toThrow()
    expect(() => conditionValue('yes', 'eq', 'boolean')).toThrow()
    expect(conditionValue('', 'exists', 'string')).toBeUndefined()
  })
})

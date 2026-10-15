import { describe, expect, it } from 'vitest'
import {
  metricAggregations,
  defaultMetricAggregation,
  metricGroupLabel,
  catalogGroupFields,
  catalogFilterFields,
  buildMetricFilter,
} from '../metrics'

describe('metric type semantics', () => {
  it('parses typed Metrics conditions without accepting malformed scalars or empty lists', () => {
    const fields = catalogFilterFields({
      items: [],
      attributes: [],
      groupFields: [{ key: 'attributes.in_stock', label: 'in_stock', type: 'boolean' }],
      enabled: true,
      truncated: false,
    })
    const boolean = fields.find((field) => field.key === 'attributes.in_stock')!
    expect(buildMetricFilter(boolean, 'eq', 'false')).toEqual({
      field: 'attributes.in_stock',
      operator: 'eq',
      value: false,
    })
    expect(() => buildMetricFilter(boolean, 'eq', 'yes')).toThrow('Boolean')
    expect(buildMetricFilter(boolean, 'exists', 'false')).toEqual({
      field: 'attributes.in_stock',
      operator: 'exists',
      value: false,
    })
    expect(() => buildMetricFilter(boolean, 'in', 'true,')).toThrow('filter value')
    expect(fields.map((field) => field.key)).not.toContain('span.op')
  })
  it('keeps custom value and project attributes distinct from built-in dimensions', () => {
    expect(
      catalogGroupFields({
        items: [],
        attributes: ['value', 'project'],
        enabled: true,
        truncated: false,
      }),
    ).toEqual(
      expect.arrayContaining([
        { key: 'value', label: 'value', type: 'number' },
        { key: 'attributes.value', label: 'attributes.value', type: 'string' },
        { key: 'attributes.project', label: 'attributes.project', type: 'string' },
      ]),
    )
  })
  it('offers aggregates suited to counters, gauges and distributions', () => {
    expect(metricAggregations('count')).toEqual(['sum', 'count'])
    expect(metricAggregations('gauge')).toEqual(['last', 'avg', 'min', 'max', 'count'])
    expect(metricAggregations('distribution')).toEqual([
      'p95',
      'p50',
      'p99',
      'avg',
      'min',
      'max',
      'sum',
      'count',
    ])
    expect(defaultMetricAggregation('count')).toBe('sum')
    expect(defaultMetricAggregation('gauge')).toBe('last')
    expect(defaultMetricAggregation('distribution')).toBe('p95')
  })
  it('labels composite group values without losing numbers, booleans or missing dimensions', () => {
    expect(metricGroupLabel(['Chrome', 150, null, false])).toBe('Chrome / 150 / (No value) / false')
  })
})

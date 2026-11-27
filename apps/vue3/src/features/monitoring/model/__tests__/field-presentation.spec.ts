import { describe, expect, it } from 'vitest'
import {
  fieldCategory,
  logGroupFields,
  visibleMetricFilters,
  visibleTraceFields,
} from '../field-presentation'

describe('explorer field presentation', () => {
  it('removes internal log fields and keeps high cardinality groups advanced', () => {
    const fields = [
      'severity',
      'message',
      'trace',
      'logId',
      'spanId',
      'timestamp_precise',
      'payload_size',
      'attributes.action',
    ].map((key) => ({ key, type: 'string' }))
    expect(logGroupFields(fields).map((f) => f.key)).toEqual(['severity', 'attributes.action'])
    expect(logGroupFields(fields, true).map((f) => f.key)).toEqual([
      'severity',
      'message',
      'trace',
      'attributes.action',
    ])
  })
  it('hides fixed metric conditions without hiding custom attributes of the same name', () => {
    expect(
      visibleMetricFilters(
        ['name', 'type', 'unit', 'project', 'value', 'attributes.name'].map((key) => ({ key })),
      ).map((f) => f.key),
    ).toEqual(['value', 'attributes.name'])
  })
  it('classifies diagnostic and scoped fields while hiding only the duplicate INP alias', () => {
    expect(fieldCategory('trace', 'http.method')).toBe('HTTP')
    expect(fieldCategory('trace', 'span.truncated')).toBe('Advanced')
    expect(fieldCategory('metric', 'attributes.action')).toBe('Business attributes')
    expect(fieldCategory('metric', 'sdk.version')).toBe('Technical attributes')
    expect(
      visibleTraceFields([
        'span.op',
        'browser.web_vital.inp.target',
        'browser.web_vital.inp.interactionTarget',
      ]),
    ).toEqual(['span.op', 'browser.web_vital.inp.interactionTarget'])
  })
})

import { describe, expect, it } from 'vitest'
import { traceVitalMarkers, resourceDetails, spanCategory } from '../trace-performance'
import type { VitalSample } from '../web-vitals'

describe('trace performance presentation', () => {
  it('places paint milestones at document-relative times without inventing CLS or INP positions', () => {
    const sample: VitalSample = {
      pageViewId: 'page',
      startedAt: '2026-11-13T00:00:00Z',
      route: '/',
      traceAvailable: true,
      measurements: [
        { name: 'FCP', value: 912 },
        { name: 'LCP', value: 948 },
        { name: 'CLS', value: 0.00004 },
        { name: 'INP', value: 200 },
      ],
    }
    expect(traceVitalMarkers([sample])).toEqual([
      { key: 'page:FCP', name: 'FCP', value: 912, at: Date.parse(sample.startedAt) + 912 },
      { key: 'page:LCP', name: 'LCP', value: 948, at: Date.parse(sample.startedAt) + 948 },
    ])
    expect(traceVitalMarkers([{ ...sample, startedAt: 'invalid' }])).toEqual([])
  })

  it('keeps inaccessible sizes unknown and formats real zero sizes and resource timings', () => {
    const details = resourceDetails({
      attributes: { 'resource.url': 'https://cdn.test/app.js', 'resource.timing_available': false },
    })
    expect(details.find((item) => item.label === 'Timing access')?.value).toBe('Unavailable')
    expect(details.find((item) => item.label === 'Transferred')?.value).toBe('Unavailable')
    const visible = resourceDetails({
      transferSize: 0,
      ttfbMs: 12.345,
      attributes: { 'resource.timing_available': true, 'resource.dns_duration': 0 },
    })
    expect(visible.find((item) => item.label === 'Transferred')?.value).toBe('0 B')
    expect(visible.find((item) => item.label === 'TTFB')?.value).toBe('12.35 ms')
    expect(visible.find((item) => item.label === 'DNS')?.value).toBe('0 ms')
    expect(spanCategory('resource.script')).toBe('resource')
    expect(spanCategory('browser.dns')).toBe('browser')
    expect(spanCategory('http.client')).toBe('http')
  })
})

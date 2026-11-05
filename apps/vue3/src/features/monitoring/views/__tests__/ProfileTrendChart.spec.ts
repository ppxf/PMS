import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ProfileTrendChart from '../../components/ProfileTrendChart.vue'
const props = {
  metric: 'self' as const,
  aggregation: 'avg',
  comparison: false,
  comparisonStart: '2026-11-04T00:00:00Z',
  comparisonEnd: '2026-11-05T00:00:00Z',
  series: [
    { at: '2026-11-04T01:00:00Z', self: 10, total: 30 },
    { at: '2026-11-04T01:30:00Z', self: 20, total: 50 },
    { at: '2026-11-05T12:00:00Z', self: 40, total: 80 },
  ],
}
describe('function trend chart', () => {
  it('aggregates real observations and keeps missing buckets disconnected', () => {
    const view = mount(ProfileTrendChart, { props })
    expect(view.findAll('circle title').map((node) => node.text())).toContain(
      '40.00 ms · bucket 13',
    )
    expect(
      (view.get('[data-testid="current-trend"]').attributes('d') ?? '').match(/M/g),
    ).toHaveLength(1)
    expect(view.text()).toContain('Previous period')
    expect(view.text()).toContain('Current period')
    expect(view.findAll('svg > text').slice(-7)).toHaveLength(7)
    expect(view.get('[data-testid="baseline-trend"]').attributes('d')).not.toBe('')
  })
  it('recomputes percentile and inclusive time without fabricating missing data', async () => {
    const view = mount(ProfileTrendChart, { props })
    await view.setProps({ metric: 'total', aggregation: 'p95' })
    expect(view.findAll('circle title').map((node) => node.text())).toContain(
      '80.00 ms · bucket 13',
    )
    await view.setProps({ series: [] })
    expect(view.get('[data-testid="current-trend"]').attributes('d')).toBe('')
    expect(view.text()).toContain('No trend samples available')
  })
})

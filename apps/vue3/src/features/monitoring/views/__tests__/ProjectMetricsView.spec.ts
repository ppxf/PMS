import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { metricCsv } from '../../model/metrics'
enableAutoUnmount(afterEach)
const api = vi.hoisted(() => ({ metricCatalog: vi.fn(), metricQuery: vi.fn() }))
vi.mock('../../api/metrics.api', () => api)
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { groupSlug: 'team', projectSlug: 'web' } }),
}))
vi.mock('vue-echarts', () => ({
  default: { props: ['option'], template: '<div class="chart" />' },
}))
import ProjectMetricsView from '../ProjectMetricsView.vue'
const result = {
  total: 21,
  page: 1,
  pageSize: 20,
  intervalMs: 60000,
  truncatedGroups: false,
  samples: [
    {
      name: 'orders',
      type: 'count' as const,
      unit: 'none',
      eventId: 'batch',
      sampleIndex: 0,
      value: 3,
      timestamp: new Date().toISOString(),
      attributes: { route: '=formula' },
    },
  ],
  aggregates: [{ groupValue: 'all', value: 3, sampleCount: 1 }],
  series: [],
}
describe('Metrics explorer', () => {
  it('queries filters and preserves time boundaries when paging', async () => {
    api.metricCatalog.mockResolvedValue({
      items: [{ name: 'orders', type: 'count', unit: 'none' }],
      attributes: ['route'],
      enabled: true,
    })
    api.metricQuery.mockResolvedValue(result)
    const view = mount(ProjectMetricsView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    expect(api.metricQuery.mock.lastCall?.[2]).toMatchObject({
      name: 'orders',
      aggregation: 'sum',
      page: 1,
    })
    const window = api.metricQuery.mock.lastCall![2]
    await view.get('[aria-label="下一页"]').trigger('click')
    await flushPromises()
    expect(api.metricQuery.mock.lastCall![2]).toMatchObject({
      page: 2,
      start: window.start,
      end: window.end,
    })
    await view.get('[aria-label="过滤属性"]').setValue('route')
    await view.get('[aria-label="过滤值"]').setValue('/checkout')
    await view.get('form').trigger('submit')
    await flushPromises()
    expect(api.metricQuery.mock.lastCall![2]).toMatchObject({
      page: 1,
      filters: [{ key: 'route', value: '/checkout' }],
    })
    await view.get('[aria-label="聚合"]').setValue('p95')
    await flushPromises()
    expect(api.metricQuery.mock.lastCall![2].aggregation).toBe('p95')
  })
  it('shows query failures and clears stale results', async () => {
    api.metricCatalog.mockResolvedValue({
      items: [{ name: 'orders', type: 'count', unit: 'none' }],
      attributes: [],
      enabled: true,
    })
    api.metricQuery.mockRejectedValue(new Error('query failed'))
    const view = mount(ProjectMetricsView)
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toBe('query failed')
    expect(view.findAll('tbody tr')).toHaveLength(0)
  })
  it('exports escaped CSV cells', () => {
    expect(metricCsv(result)).toContain('"orders"')
    expect(metricCsv(result)).toContain('"{""route"":""=formula""}"')
  })
})

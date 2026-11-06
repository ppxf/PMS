import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
const api = vi.hoisted(() => ({ metricCatalog: vi.fn(), metricQuery: vi.fn() }))
vi.mock('../../api/metrics.api', () => api)
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { groupSlug: 'team', projectSlug: 'web' } }),
  RouterLink: { template: '<a><slot /></a>' },
}))
vi.mock('vue-echarts', () => ({ default: { template: '<div />' } }))
import ProjectMetricsView from '../ProjectMetricsView.vue'
import { selectValue } from '@/test/select'
enableAutoUnmount(afterEach)
beforeEach(() => {
  api.metricCatalog.mockReset()
  api.metricQuery.mockReset()
})
it('retries a failed card without querying or resetting another card', async () => {
  api.metricCatalog.mockReset().mockResolvedValue({
    items: [
      { name: 'slow', type: 'distribution', unit: 'ms' },
      { name: 'healthy', type: 'distribution', unit: 'ms' },
    ],
    attributes: [],
    enabled: true,
  })
  api.metricQuery
    .mockReset()
    .mockImplementation((_g, _p, query) =>
      query.name === 'slow'
        ? Promise.reject(new Error('offline'))
        : Promise.resolve({ total: 0, samples: [], aggregates: [], series: [] }),
    )
  const view = mount(ProjectMetricsView)
  await flushPromises()
  await view.get('[aria-label="Add metric"]').trigger('click')
  await flushPromises()
  const before = api.metricQuery.mock.calls.length
  api.metricQuery.mockResolvedValue({ total: 0, samples: [], aggregates: [], series: [] })
  await view.get('[role="alert"] button').trigger('click')
  await flushPromises()
  expect(api.metricQuery.mock.calls.slice(before).map((call) => call[2].name)).toEqual(['slow'])
  expect(view.findAll('[data-metric-panel]')).toHaveLength(2)
  expect(view.find('[role="alert"]').exists()).toBe(false)
})
it('adds independent metric cards with one catalog and a shared query window', async () => {
  api.metricCatalog.mockResolvedValue({
    items: [
      { name: 'lcp', type: 'distribution', unit: 'ms' },
      { name: 'cls', type: 'distribution', unit: 'none' },
    ],
    attributes: [],
    enabled: true,
  })
  api.metricQuery.mockResolvedValue({ total: 0, samples: [], aggregates: [], series: [] })
  const view = mount(ProjectMetricsView)
  await flushPromises()
  await view.get('[aria-label="Add metric"]').trigger('click')
  await flushPromises()
  expect(view.findAll('[data-metric-panel]')).toHaveLength(2)
  const queries = api.metricQuery.mock.calls.map((c) => c[2])
  expect(queries.map((q) => q.name)).toEqual(['lcp', 'cls'])
  expect(queries[0].start).toBe(queries[1].start)
  expect(queries[0].end).toBe(queries[1].end)
  expect(api.metricCatalog).toHaveBeenCalledTimes(1)
  await view.get('[aria-label="Remove metric A"]').trigger('click')
  await flushPromises()
  expect(view.findAll('[data-metric-panel]')).toHaveLength(1)
  expect(view.text()).toContain('cls')
})
it('refreshes every card on a shared range change and enforces the card limit', async () => {
  api.metricCatalog.mockReset().mockResolvedValue({
    items: [
      { name: 'lcp', type: 'distribution', unit: 'ms' },
      { name: 'cls', type: 'distribution', unit: 'none' },
    ],
    attributes: [],
    enabled: true,
  })
  api.metricQuery
    .mockReset()
    .mockResolvedValue({ total: 0, samples: [], aggregates: [], series: [] })
  const view = mount(ProjectMetricsView)
  await flushPromises()
  for (let i = 0; i < 4; i++) {
    await view.get('[aria-label="Add metric"]').trigger('click')
    await flushPromises()
  }
  expect(view.findAll('[data-metric-panel]')).toHaveLength(5)
  expect(view.get('[aria-label="Add metric"]').attributes('disabled')).toBeDefined()
  const before = api.metricQuery.mock.calls.length
  await selectValue(view, 'Time range', 1)
  await flushPromises()
  const queries = api.metricQuery.mock.calls.slice(before).map((call) => call[2])
  expect(queries).toHaveLength(5)
  expect(new Set(queries.map((query) => query.end)).size).toBe(1)
  expect(
    queries.every((query) => Date.parse(query.end) - Date.parse(query.start) === 3600000),
  ).toBe(true)
})

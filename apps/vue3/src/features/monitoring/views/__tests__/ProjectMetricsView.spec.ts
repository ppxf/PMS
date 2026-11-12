import { beforeEach as beforeProjectAccessTest } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectAccessStore } from '../../model/project-access.store'
beforeProjectAccessTest(() => {
  setActivePinia(createPinia())
  useProjectAccessStore().access = { projectId: 'test-project', role: 'owner', permissions: [] }
})
import { addQuery, queryBar } from '@/test/query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { openSelect, selectValue } from '@/test/select'
import { DOMWrapper } from '@vue/test-utils'
import { metricCsv } from '../../model/metrics'
enableAutoUnmount(afterEach)
const api = vi.hoisted(() => ({ metricCatalog: vi.fn(), metricQuery: vi.fn() }))
vi.mock('../../api/metrics.api', () => api)
vi.mock('vue-router', async (original) => ({
  ...(await original<typeof import('vue-router')>()),
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
  it('queries canonical Web Vitals with p75 while custom metric ingestion is disabled', async () => {
    api.metricCatalog.mockResolvedValue({
      items: [
        {
          name: 'browser.web_vital.lcp.value',
          type: 'distribution',
          unit: 'ms',
          source: 'web_vitals',
        },
      ],
      attributes: [],
      enabled: false,
    })
    api.metricQuery.mockResolvedValue({ ...result, samples: [] })
    const view = mount(ProjectMetricsView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    expect(api.metricQuery.mock.lastCall?.[2]).toMatchObject({
      source: 'web_vitals',
      aggregation: 'p75',
    })
    expect(view.text()).toContain('Automatic Web Vitals remain available')
  })
  it('links a metric sample to its trace and exact span', async () => {
    api.metricCatalog.mockResolvedValue({
      items: [{ name: 'orders', type: 'count', unit: 'none' }],
      attributes: [],
      enabled: true,
    })
    api.metricQuery.mockResolvedValue({
      ...result,
      samples: [{ ...result.samples[0], traceId: '1'.repeat(32), spanId: '2'.repeat(16) }],
    })
    const view = mount(ProjectMetricsView, {
      attachTo: document.body,
      global: { stubs: { RouterLink: true } },
    })
    await flushPromises()
    expect(view.getComponent({ name: 'RouterLink' }).props('to')).toEqual({
      name: 'project-trace-detail',
      params: { groupSlug: 'team', projectSlug: 'web', traceId: '1'.repeat(32) },
      query: { tab: 'metrics', spanId: '2'.repeat(16) },
    })
  })
  it('queries filters and preserves time boundaries when paging', async () => {
    api.metricCatalog.mockResolvedValue({
      items: [{ name: 'orders', type: 'count', unit: 'none' }],
      attributes: ['route'],
      enabled: true,
    })
    api.metricQuery.mockResolvedValue(result)
    const view = mount(ProjectMetricsView, {
      attachTo: document.body,
      global: { stubs: { RouterLink: true } },
    })
    await flushPromises()
    expect(api.metricQuery.mock.lastCall?.[2]).toMatchObject({
      name: 'orders',
      aggregation: 'sum',
      page: 1,
    })
    const window = api.metricQuery.mock.lastCall![2]
    await view.get('[aria-label="Next page"]').trigger('click')
    await flushPromises()
    expect(api.metricQuery.mock.lastCall![2]).toMatchObject({
      page: 2,
      start: window.start,
      end: window.end,
    })
    expect(view.find('[aria-label="Environment"]').exists()).toBe(false)
    expect(view.find('[aria-label="Filter attribute"]').exists()).toBe(false)
    expect(view.find('[aria-label="Filter value type"]').exists()).toBe(false)
    await addQuery(view, 'attributes.route', 'eq', '/checkout')
    await flushPromises()
    expect(api.metricQuery.mock.lastCall![2]).toMatchObject({
      page: 1,
      filters: [{ field: 'attributes.route', operator: 'eq', value: '/checkout' }],
    })
    await selectValue(view, 'Aggregation', 'count')
    await flushPromises()
    expect(api.metricQuery.mock.lastCall![2].aggregation).toBe('count')
  })
  it('matches Metrics fields with type-specific operators, multi-values and removable conditions', async () => {
    api.metricCatalog.mockResolvedValue({
      items: [{ name: 'orders', type: 'count', unit: 'none' }],
      attributes: [],
      enabled: true,
    })
    api.metricQuery.mockResolvedValue(result)
    const view = mount(ProjectMetricsView, {
      attachTo: document.body,
      global: { stubs: { RouterLink: true } },
    })
    await flushPromises()
    const names = queryBar(view)
      .props('fields')
      .map((f) => f.key)
    expect(names).toEqual(
      expect.arrayContaining(['environment', 'value', 'browser.name', 'sdk.name']),
    )
    expect(names).not.toContain('span.op')
    await addQuery(view, 'environment', 'in', 'production, staging')
    expect(api.metricQuery.mock.lastCall![2].filters).toContainEqual({
      field: 'environment',
      operator: 'in',
      value: ['production', 'staging'],
    })
    expect(api.metricQuery.mock.lastCall![2]).not.toHaveProperty('environment')
    expect(
      queryBar(view)
        .props('fields')
        .find((f) => f.key === 'value')?.operators,
    ).not.toContain('contains')
    await addQuery(view, 'value', 'gte', '200')
    expect(api.metricQuery.mock.lastCall![2].filters).toContainEqual({
      field: 'value',
      operator: 'gte',
      value: 200,
    })
    await view.get('[aria-label="Remove condition 1"]').trigger('click')
    await flushPromises()
    expect(api.metricQuery.mock.lastCall![2].filters).toEqual([
      { field: 'value', operator: 'gte', value: 200 },
    ])
    const calls = api.metricQuery.mock.calls.length
    await addQuery(view, 'value', 'gte', 'not-a-number')
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toContain('number')
    expect(api.metricQuery).toHaveBeenCalledTimes(calls)
  })
  it('discovers custom metrics, switches type-specific aggregation and queries combined groups', async () => {
    api.metricCatalog.mockResolvedValue({
      items: [
        { name: 'inventory.stock', type: 'gauge', unit: 'none' },
        { name: 'checkout.latency', type: 'distribution', unit: 'millisecond' },
        { name: 'orders', type: 'count', unit: 'none' },
      ],
      attributes: ['warehouse'],
      enabled: true,
    })
    api.metricQuery.mockResolvedValue(result)
    const view = mount(ProjectMetricsView, {
      attachTo: document.body,
      global: { stubs: { RouterLink: true } },
    })
    await flushPromises()
    expect(api.metricQuery.mock.lastCall![2]).toMatchObject({
      name: 'inventory.stock',
      type: 'gauge',
      aggregation: 'last',
    })
    const aggregationMenu = await openSelect(view, 'Aggregation')
    expect(
      aggregationMenu.findAll('[role="option"]').map((o) => o.attributes('data-value')),
    ).toEqual(['last', 'avg', 'min', 'max', 'count'])
    await aggregationMenu.trigger('keydown', { key: 'Escape' })
    await flushPromises()
    await view.get('[aria-label="Metric"]').trigger('click')
    await flushPromises()
    const pickerMenu = () =>
      new DOMWrapper(document.querySelector<HTMLElement>('[data-slot="picker-content"]'))
    await pickerMenu().get('input[aria-label="Search application metrics"]').setValue('checkout')
    await pickerMenu().get('[role="option"]').trigger('click')
    await flushPromises()
    expect(api.metricQuery.mock.lastCall![2]).toMatchObject({
      name: 'checkout.latency',
      type: 'distribution',
      unit: 'millisecond',
      aggregation: 'p95',
    })
    const distributionMenu = await openSelect(view, 'Aggregation')
    expect(distributionMenu.find('[data-value="last"]').exists()).toBe(false)
    await distributionMenu.trigger('keydown', { key: 'Escape' })
    await flushPromises()
    await view.get('[aria-label="Group by"]').trigger('click')
    await flushPromises()
    await pickerMenu().get('input[aria-label="Group by browser.name"]').setValue(true)
    await flushPromises()
    await pickerMenu().get('input[aria-label="Group by value"]').setValue(true)
    await flushPromises()
    expect(api.metricQuery.mock.lastCall![2].groupBy).toEqual(['browser.name', 'value'])
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
    expect(view.get('[role="alert"]').text()).toContain('query failed')
    expect(view.findAll('tbody tr')).toHaveLength(0)
  })
  it('exports escaped CSV cells', () => {
    expect(metricCsv(result)).toContain('"orders"')
    expect(metricCsv(result)).toContain('"{""route"":""=formula""}"')
  })
})

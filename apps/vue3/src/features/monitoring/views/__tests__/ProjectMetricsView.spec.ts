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
      query: { spanId: '2'.repeat(16) },
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
    await selectValue(view, 'Filter field', 'attributes.route')
    await view.get('[aria-label="Filter value"]').setValue('/checkout')
    await view.get('form').trigger('submit')
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
    const fieldMenu = await openSelect(view, 'Filter field')
    const names = fieldMenu.findAll('[role="option"]').map((o) => o.attributes('data-value'))
    await fieldMenu.trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(names).toEqual(
      expect.arrayContaining(['environment', 'value', 'browser.name', 'sdk.name']),
    )
    expect(names).not.toContain('span.op')
    await selectValue(view, 'Filter field', 'environment')
    await selectValue(view, 'Filter operator', 'in')
    await view.get('[aria-label="Filter value"]').setValue('production, staging')
    await view.get('form').trigger('submit')
    await flushPromises()
    expect(api.metricQuery.mock.lastCall![2].filters).toContainEqual({
      field: 'environment',
      operator: 'in',
      value: ['production', 'staging'],
    })
    expect(api.metricQuery.mock.lastCall![2]).not.toHaveProperty('environment')
    await selectValue(view, 'Filter field', 'value')
    const operatorMenu = await openSelect(view, 'Filter operator')
    expect(operatorMenu.find('[data-value="contains"]').exists()).toBe(false)
    await operatorMenu.trigger('keydown', { key: 'Escape' })
    await flushPromises()
    await selectValue(view, 'Filter operator', 'gte')
    await view.get('[aria-label="Filter value"]').setValue('200')
    await view.get('form').trigger('submit')
    await flushPromises()
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
    await view.get('[aria-label="Filter value"]').setValue('not-a-number')
    await view.get('form').trigger('submit')
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
    expect(view.get('[role="alert"]').text()).toBe('query failed')
    expect(view.findAll('tbody tr')).toHaveLength(0)
  })
  it('exports escaped CSV cells', () => {
    expect(metricCsv(result)).toContain('"orders"')
    expect(metricCsv(result)).toContain('"{""route"":""=formula""}"')
  })
})

import { openSelect, selectValue } from '@/test/select'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
enableAutoUnmount(afterEach)
const api = vi.hoisted(() => ({
  spanSamples: vi.fn<typeof import('../../api/traces.api').spanSamples>(),
  traceSamples: vi.fn<typeof import('../../api/traces.api').traceSamples>(),
  traceSeries: vi.fn<typeof import('../../api/traces.api').traceSeries>(),
  traceAggregates: vi.fn<typeof import('../../api/traces.api').traceAggregates>(),
  traceFields: vi.fn<typeof import('../../api/traces.api').traceFields>(),
  traceDetail: vi.fn<typeof import('../../api/traces.api').traceDetail>(),
}))
vi.mock('../../api/traces.api', () => api)
const metricApi = vi.hoisted(() => ({ traceMetrics: vi.fn() }))
vi.mock('../../api/metrics.api', () => metricApi)
vi.mock('vue-echarts', () => ({
  default: { props: ['option'], template: '<div class="chart-stub" />' },
}))
const state = vi.hoisted(
  (): {
    route: undefined | { params: { groupSlug: string; projectSlug: string; traceId: string } }
    query: Record<string, string>
  } => ({ route: undefined, query: {} }),
)
vi.mock('vue-router', async (original) => {
  const { reactive } = await import('vue')
  state.query = reactive({})
  state.route = reactive({
    params: { groupSlug: 'team', projectSlug: 'web', traceId: 'trace' },
    query: state.query,
  })
  return { ...(await original<typeof import('vue-router')>()), useRoute: () => state.route }
})
import VChart from 'vue-echarts'
import ProjectTracesView from '../ProjectTracesView.vue'
import ProjectTraceDetailView from '../ProjectTraceDetailView.vue'
const root = {
  traceId: 'trace',
  spanId: 'root',
  isTransaction: true,
  op: 'pageload',
  name: 'Home',
  startTime: '2026-10-01T00:00:00Z',
  endTime: '2026-10-01T00:00:01Z',
  durationMs: 1000,
  status: 'ok',
  truncated: false,
  endReason: 'completed',
  droppedSpanCount: 0,
  attributes: { route: '/' },
}
describe('Traces views', () => {
  it('sorts samples from table headers, toggles direction and resets pagination', async () => {
    const view = mount(ProjectTracesView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    expect(view.find('select[aria-label="Sort direction"]').exists()).toBe(false)
    expect(view.get('th[aria-sort="descending"]').text()).toContain('Time')
    await view.get('button[aria-label="Next page"]').trigger('click')
    await flushPromises()
    await view.get('button[aria-label="Sort by duration"]').trigger('click')
    await flushPromises()
    expect(api.spanSamples.mock.lastCall![2]).toMatchObject({
      sortBy: 'durationMs',
      sortDirection: 'desc',
      page: 1,
    })
    await view.get('button[aria-label="Sort by duration"]').trigger('click')
    await flushPromises()
    expect(api.spanSamples.mock.lastCall![2].sortDirection).toBe('asc')
    expect(view.get('th[aria-sort="ascending"]').text()).toContain('Duration')
    await view
      .findAll('nav button')
      .find((b) => b.text() === 'Trace Samples')!
      .trigger('click')
    await flushPromises()
    await view.get('button[aria-label="Sort by span duration"]').trigger('click')
    await flushPromises()
    expect(api.traceSamples.mock.lastCall![2]).toMatchObject({
      sortBy: 'durationMs',
      sortDirection: 'desc',
    })
    await view
      .findAll('nav button')
      .find((b) => b.text() === 'Aggregates')!
      .trigger('click')
    await flushPromises()
    await view.get('button[aria-label="Sort by p95(span.duration)"]').trigger('click')
    await flushPromises()
    expect(api.traceAggregates.mock.lastCall![2]).toMatchObject({ sortBy: 0, sortDirection: 'asc' })
    expect(api.spanSamples.mock.lastCall![2].sortBy).toBe('startTime')
  })
  it('switches chart rendering without requerying and preserves missing measurements', async () => {
    api.traceSeries.mockResolvedValue({
      intervalMs: 60000,
      groups: [{ key: 'all', values: [] }],
      series: [
        {
          groupKey: 'all',
          metricIndex: 0,
          points: [
            { timestamp: root.startTime, value: 10, sampleCount: 1 },
            { timestamp: root.endTime, value: null, sampleCount: 0 },
          ],
        },
      ],
      sampleCount: 1,
    })
    const view = mount(ProjectTracesView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    expect(view.find('input[type="datetime-local"]').exists()).toBe(false)
    const calls = api.traceSeries.mock.calls.length
    const chart = view.findComponent(VChart)
    expect(chart.props('option')).toMatchObject({ series: [{ type: 'line' }] })
    await selectValue(view, 'Chart type', 'bar')
    expect(chart.props('option')).toMatchObject({ series: [{ type: 'bar' }] })
    expect(chart.props('option')).toMatchObject({
      series: [{ data: [{ value: [root.startTime, 10] }, { value: [root.endTime, null] }] }],
    })
    await selectValue(view, 'Chart type', 'line')
    expect(chart.props('option')).toMatchObject({ series: [{ type: 'line' }] })
    expect(api.traceSeries).toHaveBeenCalledTimes(calls)
  })
  it('applies chart time range and interval to every result query and resets pagination', async () => {
    const view = mount(ProjectTracesView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    await view.get('button[aria-label="Next page"]').trigger('click')
    await flushPromises()
    await selectValue(view, 'Interval', '1m')
    await flushPromises()
    await selectValue(view, 'Time range', '7d')
    await flushPromises()
    expect(api.traceSeries.mock.lastCall![2].interval).toBe('auto')
    expect(
      (await openSelect(view, 'Interval')).get('[data-value="1m"]').attributes('data-disabled'),
    ).toBeDefined()
    for (const interval of ['1h', '3h', '6h', '1d']) {
      await selectValue(view, 'Interval', interval)
      await flushPromises()
      for (const apiCall of [api.traceSeries, api.traceAggregates, api.spanSamples]) {
        const q = apiCall.mock.lastCall![2]
        expect(q).toMatchObject({ interval, page: 1 })
        expect(Date.parse(q.end) - Date.parse(q.start)).toBe(7 * 24 * 3600000)
      }
    }
  })
  it('uses backend registry field names when field metadata is unavailable', async () => {
    api.traceFields.mockRejectedValueOnce(new Error('offline'))
    const view = mount(ProjectTracesView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    const options = (await openSelect(view, 'Filter field'))
      .findAll('[role="option"]')
      .map((o) => o.text())
    expect(options).toEqual(expect.arrayContaining(['span.status', 'span.truncated', 'page.route']))
    expect(options).not.toContain('status')
    expect(options).not.toContain('truncated')
    await selectValue(view, 'Filter field', 'span.truncated')
    await view.get('input[aria-label="Filter value"]').setValue('true')
    await view
      .findAll('button')
      .find((b) => b.text() === 'Add condition')!
      .trigger('click')
    await view
      .findAll('button')
      .find((b) => b.text() === 'Update chart')!
      .trigger('click')
    await flushPromises()
    expect(api.spanSamples.mock.lastCall?.[2].filters).toContainEqual({
      field: 'span.truncated',
      operator: 'eq',
      value: true,
    })
  })
  beforeEach(() => {
    for (const key of Object.keys(state.query)) delete state.query[key]
    state.route!.params = { groupSlug: 'team', projectSlug: 'web', traceId: 'trace' }
    vi.resetAllMocks()
    metricApi.traceMetrics.mockResolvedValue({
      total: 1,
      page: 1,
      pageSize: 20,
      samples: [
        {
          name: 'orders',
          type: 'count',
          unit: 'none',
          eventId: 'batch',
          sampleIndex: 0,
          value: 1,
          timestamp: root.startTime,
          attributes: {},
          traceId: 'trace',
          spanId: 'child',
        },
      ],
    })
    api.spanSamples.mockResolvedValue({ items: [root], total: 21, page: 1, pageSize: 20 })
    api.traceSamples.mockResolvedValue({
      items: [
        {
          traceId: 'trace',
          startTime: root.startTime,
          endTime: root.endTime,
          durationMs: 1000,
          spanCount: 2,
          truncated: false,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    api.traceFields.mockResolvedValue([])
    api.traceSeries.mockResolvedValue({ intervalMs: 60000, groups: [], series: [], sampleCount: 1 })
    api.traceAggregates.mockResolvedValue({
      items: [{ groupKey: 'all', groupValues: [], values: [null], sampleCounts: [0] }],
      sampleCount: 1,
    })
  })
  it.each([1, 0])('opens the correct tab from Metrics with %i related metrics', async (total) => {
    state.query.tab = 'metrics'
    state.query.spanId = 'root'
    if (!total)
      metricApi.traceMetrics.mockResolvedValue({ total: 0, page: 1, pageSize: 20, samples: [] })
    api.traceDetail.mockResolvedValue({ items: [root], hasMore: false })
    const view = mount(ProjectTraceDetailView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    expect(view.get('nav button[aria-pressed="true"]').text()).toBe(
      total ? 'Application Metrics' : 'Waterfall',
    )
    if (total) {
      expect(view.text()).toContain('orders')
      await view.get('button[aria-label="View span child"]').trigger('click')
      expect(view.get('nav button[aria-pressed="true"]').text()).toBe('Waterfall')
    }
  })
  it('locates the linked span across cursor pages and changes selection when the query changes', async () => {
    state.query.spanId = 'child'
    api.traceDetail
      .mockResolvedValueOnce({ items: [root], hasMore: true, nextCursor: 'next' })
      .mockResolvedValueOnce({
        items: [{ ...root, spanId: 'child', parentSpanId: 'root', name: 'Checkout' }],
        hasMore: false,
      })
    const view = mount(ProjectTraceDetailView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    expect(view.get('.span-row.is-selected').text()).toContain('Checkout')
    expect(view.get('.span-panel').text()).toContain('Checkout')
    state.query.spanId = 'root'
    await flushPromises()
    expect(view.get('.span-row.is-selected').text()).toContain('Home')
  })
  it('explains unavailable traces and missing linked spans', async () => {
    state.query.spanId = 'missing'
    api.traceDetail.mockResolvedValue({ items: [], hasMore: false })
    const view = mount(ProjectTraceDetailView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    expect(view.text()).toContain('unsampled')
    expect(view.text()).toContain('expired')
    expect(view.text()).toContain('target span')
    await view.get('nav button[aria-pressed="false"]').trigger('click')
    await flushPromises()
    expect(view.text()).toContain('orders')
  })
  it('switches between the trace metric list and its linked waterfall span', async () => {
    api.traceDetail.mockResolvedValue({
      items: [root, { ...root, spanId: 'child', parentSpanId: 'root', name: 'Checkout' }],
      hasMore: false,
    })
    const view = mount(ProjectTraceDetailView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    await view.get('nav button[aria-pressed="false"]').trigger('click')
    await flushPromises()
    expect(view.text()).toContain('orders')
    await view.get('button[aria-label="View span child"]').trigger('click')
    await flushPromises()
    expect(view.get('nav button[aria-pressed="true"]').text()).toBe('Waterfall')
    expect(view.get('.span-row.is-selected').text()).toContain('Checkout')
  })
  it('reloads same trace ID across project scope and discards previous cursor', async () => {
    api.traceDetail
      .mockResolvedValueOnce({ items: [root], hasMore: true, nextCursor: 'old-project-cursor' })
      .mockResolvedValueOnce({ items: [{ ...root, name: 'Other project' }], hasMore: false })
    const view = mount(ProjectTraceDetailView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    state.route!.params = {
      groupSlug: 'other-team',
      projectSlug: 'other-project',
      traceId: 'trace',
    }
    await flushPromises()
    expect(api.traceDetail).toHaveBeenLastCalledWith(
      'other-team',
      'other-project',
      'trace',
      undefined,
    )
    expect(view.text()).toContain('Other project')
    expect(view.text()).not.toContain('not fully loaded')
    expect(view.findAll('button').some((b) => b.text() === 'Load more spans')).toBe(false)
  })
  it('retains successful aggregate units while metrics are edited or a new query fails', async () => {
    api.traceAggregates.mockResolvedValue({
      items: [{ groupKey: 'all', groupValues: [], values: [100], sampleCounts: [1] }],
      sampleCount: 1,
    })
    const view = mount(ProjectTracesView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    await view
      .findAll('nav button')
      .find((b) => b.text() === 'Aggregates')!
      .trigger('click')
    await flushPromises()
    await selectValue(view, 'Metric field 1', 'http.response_content_length')
    expect(view.get('table').text()).toContain('100 ms')
    api.spanSamples.mockRejectedValueOnce(new Error('offline'))
    await view
      .findAll('button')
      .find((b) => b.text() === 'Update chart')!
      .trigger('click')
    await flushPromises()
    expect(view.get('table').text()).toContain('100 ms')
    expect(view.get('table').text()).not.toContain('byte')
  })
  it('queries unified spans with UTC range and page-specific sorts, then changes result tab', async () => {
    const view = mount(ProjectTracesView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    expect(api.spanSamples.mock.calls[0]?.slice(0, 2)).toEqual(['team', 'web'])
    expect(api.spanSamples.mock.calls[0]?.[2]).toMatchObject({
      primaryMetric: 0,
      limit: 5,
      page: 1,
      sortBy: 'startTime',
      filters: [
        { field: 'is_transaction', operator: 'eq', value: true },
        { field: 'span.op', operator: 'in', value: ['pageload', 'navigation'] },
      ],
    })
    expect(api.spanSamples.mock.calls[0]?.[2].start).toMatch(/Z$/)
    await selectValue(view, 'Top limit', 10)
    await view
      .findAll('button')
      .find((b) => b.text() === 'Update chart')!
      .trigger('click')
    await flushPromises()
    expect(api.spanSamples.mock.lastCall?.[2].limit).toBe(10)
    await view.get('button[aria-label="Next page"]').trigger('click')
    await flushPromises()
    expect(api.spanSamples.mock.lastCall?.[2].page).toBe(2)
    await view
      .findAll('nav button')
      .find((b) => b.text() === 'Trace Samples')!
      .trigger('click')
    await flushPromises()
    expect(api.traceSamples.mock.lastCall?.[2]).toMatchObject({ page: 1, sortBy: 'startTime' })
    await view
      .findAll('nav button')
      .find((b) => b.text() === 'Aggregates')!
      .trigger('click')
    await flushPromises()
    expect(view.text()).toContain('—')
    expect(view.text()).toContain('n=0')
    expect(api.traceAggregates.mock.lastCall?.[2].sortBy).toBe(0)
    expect(api.spanSamples.mock.lastCall?.[2].sortBy).toBe('startTime')
  })
  it('loads full detail only by project and trace, joins cursor pages and shows missing-parent completeness', async () => {
    api.traceDetail
      .mockResolvedValueOnce({
        items: [
          { ...root, spanId: 'child', parentSpanId: 'root', truncated: true, droppedSpanCount: 2 },
        ],
        hasMore: true,
        nextCursor: 'cursor',
      })
      .mockResolvedValueOnce({ items: [root], hasMore: false })
    const view = mount(ProjectTraceDetailView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    expect(api.traceDetail).toHaveBeenCalledWith('team', 'web', 'trace', undefined)
    expect(view.text()).toContain('not fully loaded')
    expect(view.text()).toContain('Missing parent')
    expect(view.text()).toContain('truncated records')
    await view
      .findAll('button')
      .find((b) => b.text() === 'Load more spans')!
      .trigger('click')
    await flushPromises()
    expect(api.traceDetail).toHaveBeenLastCalledWith('team', 'web', 'trace', 'cursor')
    expect(view.text()).not.toContain('Missing parent')
    expect(view.text()).toContain('Loaded 2 spans')
  })
  it('renders query failure and retries', async () => {
    api.spanSamples.mockRejectedValueOnce(new Error('offline'))
    const view = mount(ProjectTracesView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toContain('Unable to load traces')
    await view.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(view.find('[role="alert"]').exists()).toBe(false)
  })
})

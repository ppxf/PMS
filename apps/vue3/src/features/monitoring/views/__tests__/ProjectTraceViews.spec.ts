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
vi.mock('vue-echarts', () => ({
  default: { props: ['option'], template: '<div class="chart-stub" />' },
}))
const state = vi.hoisted(() => ({
  route: undefined as
    undefined | { params: { groupSlug: string; projectSlug: string; traceId: string } },
}))
vi.mock('vue-router', async (original) => {
  const { reactive } = await import('vue')
  state.route = reactive({ params: { groupSlug: 'team', projectSlug: 'web', traceId: 'trace' } })
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
    expect(view.find('select[aria-label="排序方向"]').exists()).toBe(false)
    expect(view.get('th[aria-sort="descending"]').text()).toContain('时间')
    await view.get('button[aria-label="下一页"]').trigger('click')
    await flushPromises()
    await view.get('button[aria-label="按耗时排序"]').trigger('click')
    await flushPromises()
    expect(api.spanSamples.mock.lastCall![2]).toMatchObject({
      sortBy: 'durationMs',
      sortDirection: 'desc',
      page: 1,
    })
    await view.get('button[aria-label="按耗时排序"]').trigger('click')
    await flushPromises()
    expect(api.spanSamples.mock.lastCall![2].sortDirection).toBe('asc')
    expect(view.get('th[aria-sort="ascending"]').text()).toContain('耗时')
    await view
      .findAll('nav button')
      .find((b) => b.text() === 'Trace Samples')!
      .trigger('click')
    await flushPromises()
    await view.get('button[aria-label="按跨度排序"]').trigger('click')
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
    await view.get('button[aria-label="按 p95(span.duration) 排序"]').trigger('click')
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
    await view.get('select[aria-label="图表类型"]').setValue('bar')
    expect(chart.props('option')).toMatchObject({ series: [{ type: 'bar' }] })
    expect(chart.props('option')).toMatchObject({
      series: [{ data: [{ value: [root.startTime, 10] }, { value: [root.endTime, null] }] }],
    })
    await view.get('select[aria-label="图表类型"]').setValue('line')
    expect(chart.props('option')).toMatchObject({ series: [{ type: 'line' }] })
    expect(api.traceSeries).toHaveBeenCalledTimes(calls)
  })
  it('applies chart time range and interval to every result query and resets pagination', async () => {
    const view = mount(ProjectTracesView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    await view.get('button[aria-label="下一页"]').trigger('click')
    await flushPromises()
    await view.get('select[aria-label="时间粒度"]').setValue('1m')
    await flushPromises()
    await view.get('select[aria-label="时间范围"]').setValue('7d')
    await flushPromises()
    expect(api.traceSeries.mock.lastCall![2].interval).toBe('auto')
    expect(
      view.get('select[aria-label="时间粒度"] option[value="1m"]').attributes('disabled'),
    ).toBeDefined()
    for (const interval of ['1h', '3h', '6h', '1d']) {
      await view.get('select[aria-label="时间粒度"]').setValue(interval)
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
    const options = view
      .get('select[aria-label="筛选字段"]')
      .findAll('option')
      .map((o) => o.text())
    expect(options).toEqual(expect.arrayContaining(['span.status', 'span.truncated', 'page.route']))
    expect(options).not.toContain('status')
    expect(options).not.toContain('truncated')
    await view.get('select[aria-label="筛选字段"]').setValue('span.truncated')
    await view.get('input[aria-label="筛选值"]').setValue('true')
    await view
      .findAll('button')
      .find((b) => b.text() === '添加条件')!
      .trigger('click')
    await view
      .findAll('button')
      .find((b) => b.text() === '更新图表')!
      .trigger('click')
    await flushPromises()
    expect(api.spanSamples.mock.lastCall?.[2].filters).toContainEqual({
      field: 'span.truncated',
      operator: 'eq',
      value: true,
    })
  })
  beforeEach(() => {
    state.route!.params = { groupSlug: 'team', projectSlug: 'web', traceId: 'trace' }
    vi.resetAllMocks()
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
    expect(view.text()).not.toContain('链路尚未加载完整')
    expect(view.findAll('button').some((b) => b.text() === '加载更多 spans')).toBe(false)
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
    await view.get('select[aria-label="指标字段 1"]').setValue('http.response_content_length')
    expect(view.get('table').text()).toContain('100 ms')
    api.spanSamples.mockRejectedValueOnce(new Error('offline'))
    await view
      .findAll('button')
      .find((b) => b.text() === '更新图表')!
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
    await view.get('button[aria-label="下一页"]').trigger('click')
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
    expect(view.text()).toContain('链路尚未加载完整')
    expect(view.text()).toContain('存在缺失父节点')
    expect(view.text()).toContain('截断记录')
    await view
      .findAll('button')
      .find((b) => b.text() === '加载更多 spans')!
      .trigger('click')
    await flushPromises()
    expect(api.traceDetail).toHaveBeenLastCalledWith('team', 'web', 'trace', 'cursor')
    expect(view.text()).not.toContain('存在缺失父节点')
    expect(view.text()).toContain('已加载 2 个 spans')
  })
  it('renders query failure and retries', async () => {
    api.spanSamples.mockRejectedValueOnce(new Error('offline'))
    const view = mount(ProjectTracesView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toContain('无法加载 Traces')
    await view.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(view.find('[role="alert"]').exists()).toBe(false)
  })
})

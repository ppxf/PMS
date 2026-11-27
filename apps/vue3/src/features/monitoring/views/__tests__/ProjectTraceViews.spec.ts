import { beforeEach as beforeProjectAccessTest } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectAccessStore } from '../../model/project-access.store'
beforeProjectAccessTest(() => {
  setActivePinia(createPinia())
  useProjectAccessStore().access = { projectId: 'test-project', role: 'owner', permissions: [] }
})
import { addQuery, queryBar } from '@/test/query'
import { openSelect, selectValue } from '@/test/select'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { RouterLink } from 'vue-router'
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
const logsApi = vi.hoisted(() => ({ traceLogs: vi.fn() }))
vi.mock('../../api/logs.api', () => logsApi)
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
  return {
    ...(await original<typeof import('vue-router')>()),
    useRoute: () => state.route,
    useRouter: () => ({ push: vi.fn() }),
  }
})
import VChart from 'vue-echarts'
import ProjectTracesView from '../ProjectTracesView.vue'
import ProjectTraceDetailView from '../ProjectTraceDetailView.vue'
import TraceWebVitalsPanel from '../../components/TraceWebVitalsPanel.vue'
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
  it('marks spans with associated errors and links their issue details', async () => {
    api.traceDetail.mockResolvedValue({
      items: [
        {
          ...root,
          errorCount: 2,
          errors: [
            {
              id: 'event',
              issueId: 'issue',
              message: 'Render failed',
              exceptionType: 'TypeError',
              timestamp: '2026-11-27T00:00:00Z',
            },
          ],
        },
      ],
      hasMore: false,
    })
    const view = mount(ProjectTraceDetailView, {
      global: { stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    expect(view.get('.span-row').classes()).toContain('has-error')
    expect(view.get('.span-row').text()).toContain('2 errors')
    expect(view.get('.span-panel').text()).toContain('Render failed')
    const link = view
      .findAllComponents(RouterLink)
      .find((link) => link.text().includes('Render failed'))!
    expect(link.props('to')).toEqual({
      name: 'project-issue-detail',
      params: { groupSlug: 'team', projectSlug: 'web', issueId: 'issue' },
      query: { eventId: 'event' },
    })
  })
  it('defaults to all spans and lists nested and zero-duration children with waterfall links', async () => {
    api.spanSamples.mockResolvedValue({
      items: [
        { ...root, pageRoute: '/home' },
        {
          ...root,
          spanId: 'asset',
          parentSpanId: 'root',
          isTransaction: false,
          op: 'resource.script',
          name: 'app.js',
          pageRoute: '/home',
        },
        {
          ...root,
          spanId: 'event',
          parentSpanId: 'asset',
          isTransaction: false,
          op: 'browser.dom_content_loaded_event',
          name: 'DOMContentLoaded',
          durationMs: 0,
          pageRoute: '/home',
        },
      ],
      total: 3,
      page: 1,
      pageSize: 20,
    })
    const view = mount(ProjectTracesView, {
      global: { stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    expect(view.get('[aria-label="Quick query"]').text()).toContain('Select a quick query')
    const presets = await openSelect(view, 'Quick query')
    expect(presets.find('[data-value="all"]').exists()).toBe(false)
    expect(presets.find('[data-value="versions"]').exists()).toBe(false)
    await presets.trigger('keydown', { key: 'Escape' })
    expect(api.spanSamples.mock.lastCall?.[2].filters).toEqual([])
    expect(view.get('tbody').text()).toContain('app.js')
    expect(view.get('tbody').text()).toContain('DOMContentLoaded')
    expect(view.get('tbody').text()).toContain('0 ms')
    expect(view.get('tbody').text()).toContain('/home')
    const target = view
      .findAllComponents(RouterLink)
      .find((link) => link.text() === 'Span ID: event')!
    expect(target.props('to')).toMatchObject({
      params: { traceId: 'trace' },
      query: { spanId: 'event', tab: 'waterfall' },
    })
    await selectValue(view, 'Quick query', 'pages')
    await flushPromises()
    expect(api.spanSamples.mock.lastCall?.[2].filters).toContainEqual({
      field: 'is_transaction',
      operator: 'eq',
      value: true,
    })
    await selectValue(view, 'Quick query', 'statuses')
    expect(view.get('nav button[aria-pressed="true"]').text()).toBe('Span Samples')
    expect(api.spanSamples.mock.lastCall?.[2].filters).toEqual([
      { field: 'span.op', operator: 'eq', value: 'http.client' },
      { field: 'http.instrumentation', operator: 'eq', value: 'fetch' },
    ])
    expect(
      api.spanSamples.mock.lastCall?.[2].filters.some(
        (filter) => filter.field === 'is_transaction',
      ),
    ).toBe(false)
    await view.get('[aria-label="Remove condition span.op"]').trigger('click')
    await view.get('[aria-label="Remove condition http.instrumentation"]').trigger('click')
    await flushPromises()
    expect(api.spanSamples.mock.lastCall?.[2].filters).toEqual([])
    await addQuery(view, 'span.op', 'eq', 'resource.script')
    expect(api.spanSamples.mock.lastCall?.[2].filters).toEqual([
      { field: 'span.op', operator: 'eq', value: 'resource.script' },
    ])
    expect(view.get('nav button[aria-pressed="true"]').text()).toBe('Span Samples')
  })

  it('shows associated logs for the trace independently of the selected span', async () => {
    logsApi.traceLogs.mockResolvedValue({
      total: 1,
      page: 1,
      pageSize: 20,
      items: [
        {
          logId: 'log',
          timestamp: root.startTime,
          message: 'community initialized',
          level: 'info',
          traceId: 'trace',
          attributes: {},
        },
      ],
    })
    api.traceDetail.mockResolvedValue({ items: [root], hasMore: false })
    const view = mount(ProjectTraceDetailView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    await view
      .findAll('nav button')
      .find((button) => button.text() === 'Related logs')!
      .trigger('click')
    await flushPromises()
    expect(view.text()).toContain('community initialized')
    expect(logsApi.traceLogs.mock.lastCall?.slice(0, 3)).toEqual(['team', 'web', 'trace'])
    expect(logsApi.traceLogs.mock.lastCall?.[3]).not.toHaveProperty('spanId')
  })
  it('does not show the related logs tab without log read permission', async () => {
    useProjectAccessStore().access = {
      projectId: 'project',
      role: 'member',
      permissions: ['project:traces:read'],
    }
    logsApi.traceLogs.mockResolvedValue({ total: 1, items: [] })
    const view = mount(ProjectTraceDetailView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    expect(view.findAll('nav button').some((button) => button.text() === 'Related logs')).toBe(
      false,
    )
    expect(logsApi.traceLogs).not.toHaveBeenCalled()
  })

  it('separates unfinished measurements, timeout, data loss and legacy flags, only in waterfall', async () => {
    api.traceDetail.mockResolvedValue({
      items: [
        { ...root, endReason: 'navigation', attributes: { 'pms.measurement.status': 'lifecycle' } },
        {
          ...root,
          spanId: 'pending',
          parentSpanId: 'root',
          op: 'http.client',
          status: 'cancelled',
          attributes: { 'pms.measurement.status': 'interrupted' },
        },
        {
          ...root,
          spanId: 'timeout',
          parentSpanId: 'root',
          status: 'deadline_exceeded',
          attributes: { 'pms.measurement.status': 'timeout' },
        },
        {
          ...root,
          spanId: 'loss',
          parentSpanId: 'root',
          truncated: true,
          droppedSpanCount: 3,
          attributes: { 'pms.measurement.status': 'complete' },
        },
        { ...root, spanId: 'legacy', parentSpanId: 'root', truncated: true },
      ],
      hasMore: false,
    })
    const view = mount(ProjectTraceDetailView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    expect(view.text()).toContain('Unfinished measurements: 1')
    expect(view.text()).toContain('Timed out measurements: 1')
    expect(view.text()).toContain('Dropped spans: 3')
    expect(view.text()).toContain('Legacy truncation flags: 1')
    expect(view.get('.span-panel').text()).toContain('Route changed')
    await view.get('nav button[aria-pressed="false"]').trigger('click')
    await flushPromises()
    expect(view.find('[data-testid="measurement-notices"]').exists()).toBe(false)
  })

  it('ignores metrics availability from a previous project with the same trace ID', async () => {
    let resolveOld!: (value: unknown) => void
    metricApi.traceMetrics.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve
      }),
    )
    const view = mount(ProjectTraceDetailView, { global: { stubs: { RouterLink: true } } })
    metricApi.traceMetrics.mockResolvedValue({ total: 0, page: 1, pageSize: 20, samples: [] })
    state.route!.params = { groupSlug: 'other', projectSlug: 'other', traceId: 'trace' }
    await flushPromises()
    resolveOld({ total: 1, page: 1, pageSize: 1, samples: [] })
    await flushPromises()
    expect(
      view.findAll('nav button').some((button) => button.text() === 'Application Metrics'),
    ).toBe(false)
  })
  it('keeps the metrics tab when a name search has no results', async () => {
    const view = mount(ProjectTraceDetailView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    await view.get('nav button[aria-pressed="false"]').trigger('click')
    await flushPromises()
    metricApi.traceMetrics.mockResolvedValue({ total: 0, page: 1, pageSize: 20, samples: [] })
    await view.get('[aria-label="Search related metrics"]').setValue('missing')
    await view.get('form').trigger('submit')
    await flushPromises()
    expect(view.text()).toContain('No matching related metrics')
    expect(view.get('nav button[aria-pressed="true"]').text()).toBe('Application Metrics')
  })
  it('hides the application metrics tab without associated records', async () => {
    metricApi.traceMetrics.mockResolvedValue({ total: 0, page: 1, pageSize: 20, samples: [] })
    const view = mount(ProjectTraceDetailView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    expect(
      view.findAll('nav button').some((button) => button.text() === 'Application Metrics'),
    ).toBe(false)
  })

  it('does not stretch a page waterfall with paint markers from after the next navigation', async () => {
    const page = { ...root, pageRoute: '/' }
    const next = {
      ...root,
      spanId: 'next',
      parentSpanId: 'root',
      op: 'navigation',
      name: '/orders',
      pageRoute: '/orders',
      startTime: '2026-10-01T00:00:10Z',
      endTime: '2026-10-01T00:00:11Z',
    }
    api.traceDetail.mockResolvedValue({
      items: [page],
      hasMore: false,
      navigationSpanId: 'root',
      navigations: [page, next],
    })
    const view = mount(ProjectTraceDetailView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    view.getComponent(TraceWebVitalsPanel).vm.$emit('loaded', [
      {
        pageViewId: 'page',
        spanId: 'root',
        startedAt: root.startTime,
        route: '/',
        traceAvailable: true,
        measurements: [
          { name: 'FCP', value: 200 },
          { name: 'LCP', value: 800000 },
        ],
      },
    ])
    await flushPromises()
    expect(view.findAll('.vital-marker').map((marker) => marker.text())).toEqual(['FCP'])
    expect(view.get('.axis-ticks').text()).not.toContain('800')
    view.unmount()
  })
  it('requests the linked page scope and switches route waterfalls without changing Trace ID', async () => {
    state.query.spanId = 'orders'
    const orders = {
      ...root,
      spanId: 'orders',
      parentSpanId: 'root',
      op: 'navigation',
      name: '/orders',
      pageRoute: '/orders',
      startTime: '2026-10-01T00:10:00Z',
      endTime: '2026-10-01T00:10:01Z',
    }
    const pages = [root, orders]
    api.traceDetail.mockResolvedValueOnce({
      items: [
        orders,
        {
          ...orders,
          spanId: 'asset',
          parentSpanId: 'orders',
          isTransaction: false,
          op: 'resource.script',
          name: 'orders.js',
        },
      ],
      hasMore: false,
      navigationSpanId: 'orders',
      navigations: pages,
    })
    const view = mount(ProjectTraceDetailView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    expect(api.traceDetail).toHaveBeenCalledWith('team', 'web', 'trace', undefined, 'orders')
    expect(
      view
        .findAll('.span-row')
        .map((row) => row.text())
        .join(' '),
    ).not.toContain('Home')
    expect(view.text()).not.toContain('Missing parent')
    expect(view.findComponent(TraceWebVitalsPanel).exists()).toBe(false)
    api.traceDetail.mockResolvedValueOnce({
      items: [root],
      hasMore: false,
      navigationSpanId: 'root',
      navigations: pages,
    })
    await view.get('[aria-label="Page navigation"]').setValue('root')
    await flushPromises()
    expect(api.traceDetail).toHaveBeenLastCalledWith('team', 'web', 'trace', undefined, 'root')
    expect(
      view
        .findAll('.span-row')
        .map((row) => row.text())
        .join(' '),
    ).not.toContain('orders.js')
    view.unmount()
  })
  it('links Span IDs directly to the selected waterfall row without a completeness column', async () => {
    api.spanSamples.mockResolvedValue({
      items: [
        {
          ...root,
          startTime: '2026-10-01T00:00:00.123Z',
          endReason: 'navigation',
          truncated: true,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    const view = mount(ProjectTracesView, {
      global: { stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    expect(view.get('[data-testid="span-identity"]').text()).toContain('root')
    expect(
      view
        .findAllComponents(RouterLink)
        .find((link) => link.attributes('data-testid') === 'span-identity')!
        .props('to'),
    ).toMatchObject({ query: { spanId: 'root', tab: 'waterfall' } })
    expect(view.findAll('th').map((th) => th.text())).not.toContain('Status / completeness')
    expect(view.text()).toContain('.123')
  })
  it('displays the retained trace root and removes completeness from trace samples', async () => {
    api.traceSamples.mockResolvedValueOnce({
      items: [
        {
          traceId: 'trace',
          startTime: root.startTime,
          endTime: root.endTime,
          durationMs: 1000,
          spanCount: 2,
          truncated: true,
          rootName: 'Home',
          rootSpanId: 'root',
          rootOp: 'pageload',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    const view = mount(ProjectTracesView, {
      global: { stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    await view
      .findAll('nav button')
      .find((b) => b.text() === 'Trace Samples')!
      .trigger('click')
    await flushPromises()
    expect(view.findAll('th').map((th) => th.text())).toContain('Trace Root')
    expect(view.findAll('th').map((th) => th.text())).not.toContain('Completeness')
    expect(view.get('tbody').text()).toContain('Home')
  })

  it('filters resources while keeping their parent, collapses branches and positions late paint markers', async () => {
    api.traceDetail.mockResolvedValue({
      items: [
        root,
        {
          ...root,
          spanId: 'script',
          parentSpanId: 'root',
          name: '/assets/app.js',
          op: 'resource.script',
          isTransaction: false,
          transferSize: 0,
          attributes: {
            'resource.url': 'https://cdn.test/assets/app.js',
            'resource.timing_available': true,
          },
        },
        {
          ...root,
          spanId: 'dns',
          parentSpanId: 'root',
          name: 'DNS',
          op: 'browser.dns',
          isTransaction: false,
        },
      ],
      hasMore: false,
    })
    const view = mount(ProjectTraceDetailView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    expect(view.findAll('.span-row')).toHaveLength(3)
    await view.get('[aria-label="Collapse Home"]').trigger('click')
    expect(view.findAll('.span-row')).toHaveLength(1)
    await view.get('[aria-label="Span type"]').setValue('resource')
    expect(view.findAll('.span-row')).toHaveLength(2)
    expect(view.find('.span-row').text()).toContain('Home')
    await view.get('[aria-label="View span /assets/app.js"]').trigger('click')
    expect(view.get('[aria-label="Resource details"]').text()).toContain('0 B')
    await view.get('[aria-label="Search in trace"]').setValue('missing.js')
    expect(view.text()).toContain('No spans match your search')
    view.getComponent(TraceWebVitalsPanel).vm.$emit('loaded', [
      {
        pageViewId: 'page',
        startedAt: root.startTime,
        route: '/',
        traceAvailable: true,
        measurements: [
          { name: 'LCP', value: 1500 },
          { name: 'CLS', value: 0.01 },
        ],
      },
    ])
    await flushPromises()
    expect(view.get('[aria-label="LCP at 1500 ms"]').attributes('style')).toContain('left: 100%')
    expect(view.findAll('.vital-marker')).toHaveLength(1)
    expect(view.get('.trace-summary').text()).toContain('1 s')
    const metricsTab = view
      .findAll('button')
      .find((button) => button.text() === 'Application Metrics')!
    await metricsTab.trigger('click')
    await flushPromises()
    await view
      .findAll('nav button')
      .find((button) => button.text() === 'Waterfall')!
      .trigger('click')
    await view.get('[aria-label="Search in trace"]').setValue('')
    await view.get('[aria-label="Span type"]').setValue('all')
    await view.get('[aria-label="Expand Home"]').trigger('click')
    await view.get('[aria-label="View span DNS"]').trigger('click')
    await flushPromises()
    expect(view.get('[aria-label="Search in trace"]').element).toHaveProperty('value', '')
    expect(view.get('[aria-label="Span type"]').element).toHaveProperty('value', 'all')
    expect(view.get('[aria-label="View span DNS"]').attributes('aria-pressed')).toBe('true')
  })
  it('keeps Web Vitals measurements in metric selectors and only meaningful dimensions in groups', async () => {
    const vital = 'browser.web_vital.lcp.value'
    api.traceFields.mockResolvedValueOnce([
      {
        name: 'spans',
        type: 'number',
        groupable: false,
        operators: [],
        aggregations: ['count', 'errorRate'],
      },
      {
        name: 'span.duration',
        type: 'number',
        unit: 'ms',
        groupable: false,
        operators: ['gt'],
        aggregations: ['avg', 'p95'],
      },
      {
        name: vital,
        type: 'number',
        unit: 'ms',
        groupable: false,
        operators: ['gt', 'exists'],
        aggregations: ['avg', 'p75', 'p95'],
      },
      {
        name: 'browser.web_vital.inp.interactionTarget',
        type: 'string',
        groupable: true,
        operators: ['eq'],
        aggregations: [],
      },
      {
        name: 'browser.web_vital.inp.target',
        type: 'string',
        groupable: false,
        operators: ['eq'],
        aggregations: [],
      },
    ])
    const view = mount(ProjectTracesView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    expect(
      queryBar(view)
        .props('fields')
        .map((field) => field.key),
    ).not.toContain('spans')
    await selectValue(view, 'Quick query', 'pages')
    await flushPromises()
    await selectValue(view, 'Metric field 1', vital)
    expect(
      queryBar(view)
        .props('fields')
        .map((field) => field.key),
    ).not.toContain('browser.web_vital.inp.target')
    expect(view.find('[aria-label="Group field category"]').exists()).toBe(false)
    await view
      .findAll('button')
      .find((button) => button.text() === 'Add group')!
      .trigger('click')
    const menu = await openSelect(view, 'Group by 1')
    expect(menu.find(`[data-value="${vital}"]`).exists()).toBe(false)
    expect(menu.find('[data-value="browser.web_vital.inp.target"]').exists()).toBe(false)
    await selectValue(view, 'Group by 1', 'browser.web_vital.inp.interactionTarget')
    expect(view.get('[aria-label="Metric field 1"]').text()).toContain(vital)
    expect(view.get('[aria-label="Group by 1"]').text()).toContain(
      'browser.web_vital.inp.interactionTarget',
    )
  })
  it('adds group selectors on demand and removes selected fields from the query', async () => {
    const view = mount(ProjectTracesView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    const calls = api.traceSeries.mock.calls.length
    expect(api.traceSeries.mock.lastCall?.[2].groupBy).toEqual([])
    expect(view.find('[aria-label="Group by 1"]').exists()).toBe(false)
    expect(view.find('[aria-label="Group field category"]').exists()).toBe(false)
    await view
      .findAll('button')
      .find((button) => button.text() === 'Add group')!
      .trigger('click')
    expect(api.traceSeries).toHaveBeenCalledTimes(calls)
    expect(view.get('[aria-label="Group by 1"]').text()).toContain('Select a field')
    expect(view.get('nav button[aria-pressed="true"]').text()).toBe('Span Samples')
    const aggregateCalls = api.traceAggregates.mock.calls.length
    await selectValue(view, 'Group by 1', 'span.name')
    expect(view.get('nav button[aria-pressed="true"]').text()).toBe('Aggregates')
    expect(api.traceAggregates).toHaveBeenCalledTimes(aggregateCalls + 1)
    expect(api.traceAggregates.mock.lastCall?.[2]).toMatchObject({
      groupBy: ['span.name'],
      sortBy: 0,
    })
    await view
      .findAll('button')
      .find((button) => button.text() === 'Add group')!
      .trigger('click')
    expect(view.get('[aria-label="Group by 2"]').text()).toContain('Select a field')
    expect(view.find('[aria-label="Group field category"]').exists()).toBe(false)
    await selectValue(view, 'Group by 2', 'http.method')
    expect(api.traceSeries.mock.lastCall?.[2].groupBy).toEqual(['span.name', 'http.method'])
    await view
      .findAll('button')
      .find((button) => button.text() === 'Add group')!
      .trigger('click')
    await selectValue(view, 'Group by 3', 'http.route')
    const groupBy = ['span.name', 'http.method', 'http.route']
    expect(api.traceSeries.mock.lastCall?.[2].groupBy).toEqual(groupBy)
    expect(api.traceAggregates.mock.lastCall?.[2].groupBy).toEqual(groupBy)
    await view.get('[aria-label="Remove group 3"]').trigger('click')
    await view.get('[aria-label="Remove group 1"]').trigger('click')
    expect(api.traceSeries.mock.lastCall?.[2].groupBy).toEqual(['http.method'])
    expect(view.find('[aria-label="Group by 2"]').exists()).toBe(false)
    expect(view.get('nav button[aria-pressed="true"]').text()).toBe('Aggregates')
    await view.get('[aria-label="Remove group 1"]').trigger('click')
    expect(view.get('nav button[aria-pressed="true"]').text()).toBe('Span Samples')
    expect(api.spanSamples.mock.lastCall?.[2]).toMatchObject({ groupBy: [], sortBy: 'startTime' })
  })
  it('keeps tab loading inside the results table until the new rows arrive', async () => {
    const view = mount(ProjectTracesView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    const chart = view.getComponent(VChart).element
    const calls = api.traceSeries.mock.calls.length
    type TraceSamplesResult = Awaited<ReturnType<typeof api.traceSamples>>
    let resolveSamples!: (result: TraceSamplesResult) => void
    api.traceSamples.mockReturnValueOnce(
      new Promise<TraceSamplesResult>((resolve) => {
        resolveSamples = resolve
      }),
    )

    await view
      .findAll('nav button')
      .find((button) => button.text() === 'Trace Samples')!
      .trigger('click')
    expect(view.get('table').attributes('aria-busy')).toBe('true')
    expect(view.get('tbody [role="status"]').text()).toBe('Loading results…')
    expect(view.get('tbody').text()).not.toContain('No data')
    expect(view.getComponent(VChart).element).toBe(chart)
    expect(api.traceSeries).toHaveBeenCalledTimes(calls)

    resolveSamples({ items: [], total: 0, page: 1, pageSize: 20 })
    await flushPromises()
    expect(view.get('table').attributes('aria-busy')).toBe('false')
    expect(view.get('tbody').text()).toBe('No data')
  })
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
    await view.get('button[aria-label="Sort by count(spans)"]').trigger('click')
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
  it('adds a separate chart per metric and removes it with the metric', async () => {
    const view = mount(ProjectTracesView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    expect(view.findAllComponents(VChart)).toHaveLength(1)
    for (const value of [1, 2]) {
      api.traceSeries.mockResolvedValueOnce({
        intervalMs: 60000,
        groups: [{ key: 'all', values: [] }],
        series: [
          {
            metricIndex: 0,
            groupKey: 'all',
            points: [{ timestamp: root.startTime, value, sampleCount: 1 }],
          },
        ],
        sampleCount: 1,
      })
    }
    await view
      .findAll('button')
      .find((b) => b.text() === 'Add metric series')!
      .trigger('click')
    await flushPromises()
    const charts = view.findAllComponents(VChart)
    expect(charts).toHaveLength(2)
    for (const [index, chart] of charts.entries()) {
      expect(chart.props('option')?.series).toEqual([
        expect.objectContaining({ data: [{ value: [root.startTime, index + 1], sampleCount: 1 }] }),
      ])
    }
    const calls = api.traceSeries.mock.calls.length
    const resultCalls = api.spanSamples.mock.calls.length
    await selectValue(view, 'Chart type for chart 2', 'bar')
    expect(charts[0]!.props('option')).toMatchObject({ series: [{ type: 'line' }] })
    expect(charts[1]!.props('option')).toMatchObject({ series: [{ type: 'bar' }] })
    expect(api.traceSeries).toHaveBeenCalledTimes(calls)
    await selectValue(view, 'Time range for chart 2', '6h')
    await selectValue(view, 'Interval for chart 2', '30m')
    expect(api.traceSeries).toHaveBeenCalledTimes(calls + 2)
    expect(api.spanSamples).toHaveBeenCalledTimes(resultCalls)
    const q = api.traceSeries.mock.lastCall![2]
    expect(q).toMatchObject({
      interval: '30m',
      primaryMetric: 0,
      metrics: [{ function: 'avg', field: 'span.duration' }],
    })
    expect(Date.parse(q.end) - Date.parse(q.start)).toBe(6 * 3600000)
    expect(view.get('[aria-label="Time range"]').text()).toBe('Last hour')
    await view
      .findAll('button')
      .filter((b) => b.text() === 'Remove metric')[1]!
      .trigger('click')
    await flushPromises()
    expect(view.findAllComponents(VChart)).toHaveLength(1)
  })
  it('applies chart time range and interval to every result query and resets pagination', async () => {
    const view = mount(ProjectTracesView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    await view.get('button[aria-label="Next page"]').trigger('click')
    await flushPromises()
    await selectValue(view, 'Interval', '1m')
    await selectValue(view, 'Time range', '7d')
    expect(api.traceSeries.mock.lastCall![2].interval).toBe('auto')
    expect(
      (await openSelect(view, 'Interval')).get('[data-value="1m"]').attributes('data-disabled'),
    ).toBeDefined()
    for (const interval of ['1h', '3h', '6h', '1d']) {
      await selectValue(view, 'Interval', interval)
      for (const apiCall of [api.traceSeries, api.traceAggregates, api.spanSamples]) {
        const q = apiCall.mock.lastCall![2]
        expect(q).toMatchObject({ interval, page: 1 })
        expect(Date.parse(q.end) - Date.parse(q.start)).toBe(7 * 24 * 3600000)
      }
    }
    await selectValue(view, 'Time range', '30d')
    const q = api.traceSeries.mock.lastCall![2]
    expect(Date.parse(q.end) - Date.parse(q.start)).toBe(30 * 86400000)
    const option = view.findComponent(VChart).props('option')
    expect(option).toMatchObject({
      xAxis: { min: Date.parse(q.start), max: Date.parse(q.end) },
      yAxis: { min: 0 },
    })
  })
  it('uses backend registry field names when field metadata is unavailable', async () => {
    api.traceFields.mockRejectedValueOnce(new Error('offline'))
    const view = mount(ProjectTracesView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    const options = queryBar(view)
      .props('fields')
      .map((f) => f.key)
    expect(options).toEqual(expect.arrayContaining(['span.status', 'span.truncated', 'page.route']))
    expect(options).not.toContain('status')
    expect(options).not.toContain('truncated')
    await addQuery(view, 'span.truncated', 'eq', 'true')
    await flushPromises()
    expect(api.spanSamples.mock.lastCall?.[2].filters).toContainEqual({
      field: 'span.truncated',
      operator: 'eq',
      value: true,
    })
    await view.get('button[aria-label="Remove condition span.truncated"]').trigger('click')
    expect(api.spanSamples.mock.lastCall?.[2].filters).not.toContainEqual({
      field: 'span.truncated',
      operator: 'eq',
      value: true,
    })
  })
  beforeEach(() => {
    for (const key of Object.keys(state.query)) delete state.query[key]
    state.route!.params = { groupSlug: 'team', projectSlug: 'web', traceId: 'trace' }
    vi.resetAllMocks()
    logsApi.traceLogs.mockResolvedValue({ total: 0, page: 1, pageSize: 20, items: [] })
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
    if (!total) return
    expect(view.text()).toContain('orders')
    expect(view.find('button[aria-label="View span child"]').exists()).toBe(false)
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
  it('keeps trace metrics independent of waterfall span selection', async () => {
    api.traceDetail.mockResolvedValue({
      items: [root, { ...root, spanId: 'child', parentSpanId: 'root', name: 'Checkout' }],
      hasMore: false,
    })
    const view = mount(ProjectTraceDetailView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    await view.get('nav button[aria-pressed="false"]').trigger('click')
    await flushPromises()
    expect(view.text()).toContain('orders')
    expect(view.find('button[aria-label="View span child"]').exists()).toBe(false)
    await view.get('nav button[aria-pressed="false"]').trigger('click')
    await view.get('[aria-label="View span Checkout"]').trigger('click')
    await view.get('nav button[aria-pressed="false"]').trigger('click')
    await flushPromises()
    expect(view.get('nav button[aria-pressed="true"]').text()).toBe('Application Metrics')
    expect(view.text()).toContain('orders')
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
    await selectValue(view, 'Quick query', 'pages')
    await flushPromises()
    await view
      .findAll('nav button')
      .find((b) => b.text() === 'Aggregates')!
      .trigger('click')
    await flushPromises()
    expect(view.get('table').text()).toContain('100 ms')
    api.spanSamples.mockRejectedValueOnce(new Error('offline'))
    await selectValue(view, 'Metric field 1', 'http.response_content_length')
    await flushPromises()
    expect(api.spanSamples.mock.lastCall?.[2].metrics[0]?.field).toBe(
      'http.response_content_length',
    )
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
      filters: [],
    })
    expect(api.spanSamples.mock.calls[0]?.[2].start).toMatch(/Z$/)
    await selectValue(view, 'Top limit', 10)
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
    expect(view.text()).toContain('Dropped spans: 2')
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

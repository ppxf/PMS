import { selectValue } from '@/test/select'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { logsCsv } from '../../model/logs'
enableAutoUnmount(afterEach)
const api = vi.hoisted(() => ({ logFields: vi.fn(), logQuery: vi.fn() }))
vi.mock('../../api/logs.api', () => api)
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { groupSlug: 'team', projectSlug: 'web' } }),
}))
vi.mock('vue-echarts', () => ({
  default: { props: ['option'], template: '<div class="chart" />' },
}))
import ProjectLogsView from '../ProjectLogsView.vue'
import LogFieldPicker from '../LogFieldPicker.vue'
const result = {
  total: 21,
  page: 1,
  pageSize: 20,
  intervalMs: 60000,
  items: [
    {
      logId: 'record',
      timestamp: new Date().toISOString(),
      level: 'info' as const,
      message: '=formula',
      attributes: { count: 2 },
      environment: 'prod',
    },
  ],
  series: [],
}
beforeEach(() => {
  vi.clearAllMocks()
  api.logFields.mockResolvedValue({
    attributes: ['count'],
    enabled: true,
    dsn: 'https://key@example.com/api/sdk/project',
    levels: ['info'],
  })
  api.logQuery.mockResolvedValue(result)
})
afterEach(() => vi.useRealTimers())
describe('Logs explorer', () => {
  it('restricts aggregation fields and shares the curated fields across filters and groups', async () => {
    api.logFields.mockResolvedValue({
      fields: [{ key: 'attributes.custom', type: 'number', category: 'Attributes' }],
      attributes: ['custom'],
      enabled: true,
      levels: [],
    })
    const view = mount(ProjectLogsView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    const picker = (label: string) =>
      view.findAllComponents(LogFieldPicker).find((p) => p.props('label') === label)!
    const keys = (label: string) =>
      picker(label)
        .props('fields')
        .map((f) => f.key)
    expect(keys('Chart field 1')).toEqual(['logs'])
    const expected = [
      'client.address',
      'message',
      'origin',
      'payload_size',
      'project',
      'sdk.name',
      'sdk.version',
      'severity',
      'timestamp',
      'trace',
      'user_agent.original',
      'browser.name',
      'browser.version',
      'log_source',
    ]
    expect(keys('Log filters field')).toEqual(expected)
    for (const aggregate of ['sum', 'avg', 'p50', 'p75', 'p90', 'p95', 'p99', 'max', 'min']) {
      await selectValue(view, 'Aggregate 1', aggregate)
      expect(keys('Chart field 1')).toEqual(['payload_size'])
      expect(api.logQuery.mock.lastCall![2].visualizations[0].field).toBe('payload_size')
    }
    await selectValue(view, 'Aggregate 1', 'count_unique')
    expect(keys('Chart field 1')).toEqual(expected)
    picker('Chart field 1').vm.$emit('update:modelValue', 'message')
    await selectValue(view, 'Aggregate 1', 'count')
    expect(api.logQuery.mock.lastCall![2].visualizations[0].field).toBe('logs')
    await view
      .findAll('button')
      .find((b) => b.text() === 'Add group')!
      .trigger('click')
    expect(keys('Group 1.1')).toEqual(expected)
  }, 15000)
  it('uses conditions instead of the previous configuration and preserves paging windows', async () => {
    const view = mount(ProjectLogsView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    expect(view.find('[aria-label="Search logs"]').exists()).toBe(false)
    const window = api.logQuery.mock.lastCall![2]
    await view.get('[aria-label="Next page"]').trigger('click')
    await flushPromises()
    expect(api.logQuery.mock.lastCall![2]).toMatchObject({
      page: 2,
      start: window.start,
      end: window.end,
    })
    await view.get('[aria-label="Log filters value"]').setValue('checkout')
    await view.get('form[aria-label="Log filters"]').trigger('submit')
    await flushPromises()
    expect(api.logQuery.mock.lastCall![2]).toMatchObject({
      page: 1,
      conditions: [{ key: 'message', operator: 'contains', value: 'checkout' }],
      visualizations: [{ aggregate: 'count', field: 'logs' }],
    })
    await view.get('[aria-label="View log record"]').trigger('click')
    expect(view.text()).toContain('logId')
    expect(view.text()).toContain('Copy as JSON')
  })
  it('switches aggregates, sends independent series conditions and excludes detail values', async () => {
    const view = mount(ProjectLogsView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    await selectValue(view, 'Aggregate 1', 'avg')
    expect(api.logQuery.mock.lastCall![2].visualizations[0]).toMatchObject({
      aggregate: 'avg',
      field: 'payload_size',
    })
    await view.get('[aria-label="Series 1 value"]').setValue('retry')
    await view.get('form[aria-label="Series 1"]').trigger('submit')
    await flushPromises()
    expect(api.logQuery.mock.lastCall![2]).toMatchObject({
      conditions: [],
      visualizations: [{ conditions: [{ key: 'message', operator: 'contains', value: 'retry' }] }],
    })
    expect(view.get('main h3').text()).toBe('avg_if(`message:*"retry*"`, payload_size)')
    await view.get('[aria-label="Remove Series 1 condition 1"]').trigger('click')
    await flushPromises()
    expect(view.get('main h3').text()).toBe('avg(payload_size)')
    await view.get('[aria-label="View log record"]').trigger('click')
    await view.get('[aria-label="Exclude attributes.count from filter"]').trigger('click')
    await flushPromises()
    expect(api.logQuery.mock.lastCall![2].conditions).toEqual([
      { key: 'attributes.count', operator: 'neq', value: 2 },
    ])
  })
  it('dismisses the columns menu with Escape and preserves selected columns', async () => {
    const view = mount(ProjectLogsView, {
      attachTo: document.body,
      global: { stubs: { RouterLink: true } },
    })
    await flushPromises()
    await view.get('button[aria-label="Columns"]').trigger('click')
    await flushPromises()
    const menu = new DOMWrapper(
      document.querySelector<HTMLElement>('[role="dialog"][aria-label="Columns"]'),
    )
    await menu.get('input[aria-label="Show attributes"]').setValue(true)
    expect(view.findAll('th').map((cell) => cell.text())).toContain('Attributes')
    await menu.trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(view.get('button[aria-label="Columns"]').attributes('aria-expanded')).toBe('false')
    await view.get('button[aria-label="Columns"]').trigger('click')
    await flushPromises()
    expect(
      document.querySelector<HTMLInputElement>('input[aria-label="Show attributes"]')!.checked,
    ).toBe(true)
  })
  it('retains numeric time ranges and intervals through the shared menus', async () => {
    const view = mount(ProjectLogsView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    await selectValue(view, 'Time range', 6)
    await selectValue(view, 'Interval', 60)
    const query = api.logQuery.mock.lastCall![2]
    expect(query.intervalSeconds).toBe(60)
    expect(Date.parse(query.end) - Date.parse(query.start)).toBe(6 * 3600000)
  })
  it('shows failures without stale rows', async () => {
    const view = mount(ProjectLogsView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    api.logQuery.mockRejectedValue(new Error('query failed'))
    await view.get('[aria-label="Refresh"]').trigger('click')
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toBe('query failed')
    expect(view.findAll('tbody tr')).toHaveLength(0)
  })
  it('refreshes periodically and stops after unmount', async () => {
    vi.useFakeTimers()
    const view = mount(ProjectLogsView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    await view.get('[aria-label="Auto refresh"]').setValue(true)
    await vi.advanceTimersByTimeAsync(15000)
    await flushPromises()
    expect(api.logQuery).toHaveBeenCalledTimes(2)
    view.unmount()
    await vi.advanceTimersByTimeAsync(30000)
    expect(api.logQuery).toHaveBeenCalledTimes(2)
  })
  it('escapes CSV messages and guards spreadsheet formulas', () => {
    expect(logsCsv(result.items)).toContain('"\'=formula"')
    expect(logsCsv(result.items)).toContain('"{""count"":2}"')
  })
})

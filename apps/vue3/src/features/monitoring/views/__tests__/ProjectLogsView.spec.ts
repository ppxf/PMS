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
  it('queries searches, levels and typed filters and preserves the paging window', async () => {
    const view = mount(ProjectLogsView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    const window = api.logQuery.mock.lastCall![2]
    await view.get('[aria-label="Next page"]').trigger('click')
    await flushPromises()
    expect(api.logQuery.mock.lastCall![2]).toMatchObject({
      page: 2,
      start: window.start,
      end: window.end,
    })
    await view.get('[aria-label="Search logs"]').setValue('checkout')
    await view.findAll('form')[0]!.trigger('submit')
    await flushPromises()
    expect(api.logQuery.mock.lastCall![2]).toMatchObject({ page: 1, search: 'checkout' })
    await view.get('[aria-label="Level error"]').setValue(true)
    await flushPromises()
    expect(api.logQuery.mock.lastCall![2].levels).toEqual(['error'])
    await selectValue(view, 'Filter attribute', 'count')
    await selectValue(view, 'Filter value type', 'number')
    await view.get('[aria-label="Filter value"]').setValue('2')
    await view.findAll('form')[1]!.trigger('submit')
    await flushPromises()
    expect(api.logQuery.mock.lastCall![2].filters).toEqual([{ key: 'count', value: 2 }])
    await view.get('[aria-label="View log record"]').trigger('click')
    expect(view.text()).toContain('Log ID / Release / Span ID')
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
  it('shows failures without stale rows and rejects invalid trace filters locally', async () => {
    const view = mount(ProjectLogsView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    api.logQuery.mockRejectedValue(new Error('query failed'))
    await view.get('[aria-label="Refresh"]').trigger('click')
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toBe('query failed')
    expect(view.findAll('tbody tr')).toHaveLength(0)
    await view.get('[aria-label="Trace ID"]').setValue('bad')
    await view.get('[aria-label="Trace ID"]').trigger('change')
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toContain('Trace ID')
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

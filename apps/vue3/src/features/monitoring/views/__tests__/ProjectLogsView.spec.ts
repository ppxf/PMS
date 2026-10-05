import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
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
    await view.get('[aria-label="下一页"]').trigger('click')
    await flushPromises()
    expect(api.logQuery.mock.lastCall![2]).toMatchObject({
      page: 2,
      start: window.start,
      end: window.end,
    })
    await view.get('[aria-label="搜索日志"]').setValue('checkout')
    await view.findAll('form')[0]!.trigger('submit')
    await flushPromises()
    expect(api.logQuery.mock.lastCall![2]).toMatchObject({ page: 1, search: 'checkout' })
    await view.get('[aria-label="级别 error"]').setValue(true)
    await flushPromises()
    expect(api.logQuery.mock.lastCall![2].levels).toEqual(['error'])
    await view.get('[aria-label="过滤属性"]').setValue('count')
    await view.get('[aria-label="过滤值类型"]').setValue('number')
    await view.get('[aria-label="过滤值"]').setValue('2')
    await view.findAll('form')[1]!.trigger('submit')
    await flushPromises()
    expect(api.logQuery.mock.lastCall![2].filters).toEqual([{ key: 'count', value: 2 }])
    await view.get('[aria-label="查看日志 record"]').trigger('click')
    expect(view.text()).toContain('Log ID / Release / Span ID')
  })
  it('shows failures without stale rows and rejects invalid trace filters locally', async () => {
    const view = mount(ProjectLogsView)
    await flushPromises()
    api.logQuery.mockRejectedValue(new Error('query failed'))
    await view.get('[aria-label="刷新"]').trigger('click')
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toBe('query failed')
    expect(view.findAll('tbody tr')).toHaveLength(0)
    await view.get('[aria-label="Trace ID"]').setValue('bad')
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toContain('Trace ID')
  })
  it('refreshes periodically and stops after unmount', async () => {
    vi.useFakeTimers()
    const view = mount(ProjectLogsView)
    await flushPromises()
    await view.get('[aria-label="自动刷新"]').setValue(true)
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

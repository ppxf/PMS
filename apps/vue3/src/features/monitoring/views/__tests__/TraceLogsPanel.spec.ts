import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import TraceLogsPanel from '../../components/TraceLogsPanel.vue'
enableAutoUnmount(afterEach)
const api = vi.hoisted(() => ({ traceLogs: vi.fn() }))
vi.mock('../../api/logs.api', () => api)
const props = { group: 'team', project: 'web', traceId: 'trace' }
const row = {
  logId: 'log',
  timestamp: '2026-11-26T00:00:00.123Z',
  message: 'hello',
  level: 'info',
  traceId: 'trace',
  spanId: 'span',
  environment: 'dev',
  attributes: { action: 'click' },
}
const options = {
  props,
  global: { stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
}
beforeEach(() => {
  api.traceLogs.mockReset().mockResolvedValue({ total: 21, page: 1, pageSize: 20, items: [row] })
})
it('expands the original log and loads the next trace-wide page', async () => {
  const view = mount(TraceLogsPanel, options)
  await flushPromises()
  await view.get('[aria-label="View log hello"]').trigger('click')
  expect(view.get('dl').text()).toContain('span')
  expect(view.text()).toContain('click')
  expect(view.text()).toContain('.123')
  await view.get('[aria-label="Next logs page"]').trigger('click')
  await flushPromises()
  expect(api.traceLogs.mock.lastCall).toEqual(['team', 'web', 'trace', { page: 2, pageSize: 20 }])
})
it('keeps search results independent of availability and retries a failed request', async () => {
  const view = mount(TraceLogsPanel, options)
  await flushPromises()
  api.traceLogs.mockResolvedValueOnce({ total: 0, page: 1, pageSize: 20, items: [] })
  await view.get('[aria-label="Search related logs"]').setValue('missing')
  await view.get('form').trigger('submit')
  await flushPromises()
  expect(view.text()).toContain('No matching related logs')
  expect(api.traceLogs.mock.lastCall?.[3]).toEqual({ page: 1, pageSize: 20, search: 'missing' })
  api.traceLogs.mockRejectedValueOnce(new Error('offline'))
  await view.get('form').trigger('submit')
  await flushPromises()
  expect(view.get('[role="alert"]').text()).toContain('Unable to load related logs')
  await view.get('[role="alert"] button').trigger('click')
  await flushPromises()
  expect(view.find('[role="alert"]').exists()).toBe(false)
})
it('discards stale responses when the same trace ID is opened in another project', async () => {
  let resolveOld!: (value: unknown) => void
  api.traceLogs.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveOld = resolve
    }),
  )
  const view = mount(TraceLogsPanel, options)
  await view.setProps({ project: 'other' })
  await flushPromises()
  resolveOld({ total: 1, page: 1, pageSize: 20, items: [{ ...row, message: 'stale' }] })
  await flushPromises()
  expect(view.text()).not.toContain('stale')
})

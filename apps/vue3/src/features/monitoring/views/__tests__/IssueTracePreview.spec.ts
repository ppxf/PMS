import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { RouterLink } from 'vue-router'
import { useProjectAccessStore } from '../../model/project-access.store'
import IssueTracePreview from '../../components/IssueTracePreview.vue'
import type { Span } from '../../model/traces'
const api = vi.hoisted(() => ({ traceDetail: vi.fn() }))
vi.mock('../../api/traces.api', () => api)
const trace = { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), sampled: true }
const root: Span = {
  traceId: trace.traceId,
  spanId: 'c'.repeat(16),
  isTransaction: true,
  op: 'navigation',
  name: '/lab',
  startTime: '2026-11-27T00:00:00Z',
  endTime: '2026-11-27T00:00:01Z',
  durationMs: 1000,
  status: 'ok',
  truncated: false,
  endReason: 'completed',
  droppedSpanCount: 0,
  attributes: {},
}
const child = {
  ...root,
  spanId: trace.spanId,
  parentSpanId: root.spanId,
  isTransaction: false,
  op: 'resource.script',
  name: 'app.js',
  durationMs: 250,
}
function render(context = trace) {
  return mount(IssueTracePreview, {
    props: { groupSlug: 'team', projectSlug: 'web', trace: context },
    global: { stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
  })
}
beforeEach(() => {
  setActivePinia(createPinia())
  useProjectAccessStore().access = { projectId: 'project', role: 'owner', permissions: [] }
  api.traceDetail.mockReset().mockResolvedValue({ items: [root, child], hasMore: false })
})
describe('issue trace preview', () => {
  it('renders the span tree, marks the error anchor and links to that span in the waterfall', async () => {
    const view = render()
    await flushPromises()
    expect(api.traceDetail).toHaveBeenCalledWith(
      'team',
      'web',
      trace.traceId,
      undefined,
      trace.spanId,
    )
    expect(view.text()).toContain(trace.traceId)
    expect(view.text()).toContain('/lab')
    expect(view.text()).toContain('app.js')
    const row = view.get(`[data-span-id="${trace.spanId}"]`)
    expect(row.classes()).toContain('has-error')
    expect(
      view.findAllComponents(RouterLink).some((link) => {
        const to = link.props('to')
        return (
          typeof to !== 'string' &&
          'name' in to &&
          to.name === 'project-trace-detail' &&
          to.params?.traceId === trace.traceId &&
          to.params?.groupSlug === 'team' &&
          to.params?.projectSlug === 'web' &&
          to.query?.spanId === trace.spanId &&
          to.query?.tab === 'waterfall'
        )
      }),
    ).toBe(true)
  })
  it('explains unsampled and missing traces without hiding the error', async () => {
    const view = render({ ...trace, sampled: false })
    await flushPromises()
    expect(view.text()).toContain('This trace was not sampled.')
    expect(api.traceDetail).not.toHaveBeenCalled()
    await view.setProps({ trace })
    api.traceDetail.mockResolvedValueOnce({ items: [], hasMore: false })
    await view.setProps({ trace: { ...trace, traceId: 'd'.repeat(32) } })
    await flushPromises()
    expect(view.text()).toContain(
      'Trace spans are unavailable. They may not have arrived yet or may have expired.',
    )
  })
  it('does not fetch traces without trace permission', async () => {
    useProjectAccessStore().access = {
      projectId: 'project',
      role: 'member',
      permissions: ['project:issues:read'],
    }
    const view = render()
    await flushPromises()
    expect(api.traceDetail).not.toHaveBeenCalled()
    expect(view.text()).toContain('You do not have permission to view this trace.')
    expect(view.find('a').exists()).toBe(false)
  })
  it('keeps the full trace link and offers retry after a failed preview request', async () => {
    api.traceDetail.mockRejectedValueOnce(new Error('offline'))
    const view = render()
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toContain('Unable to load trace preview')
    await view.get('button[aria-label="Retry trace preview"]').trigger('click')
    await flushPromises()
    expect(view.text()).toContain('app.js')
    expect(view.find('[role="alert"]').exists()).toBe(false)
  })
})

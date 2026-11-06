import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
const api = vi.hoisted(() => ({ webVitalsQuery: vi.fn() }))
vi.mock('../../api/web-vitals.api', () => api)
import TraceWebVitalsPanel from '../../components/TraceWebVitalsPanel.vue'
enableAutoUnmount(afterEach)
describe('Trace page experience', () => {
  it('keeps missing INP absent and renders zero CLS and late attribution', async () => {
    api.webVitalsQuery.mockResolvedValue({
      items: [
        {
          pageViewId: 'page',
          route: '/products/:id',
          startedAt: '2026-11-06T00:00:00Z',
          measurements: [
            { name: 'CLS', value: 0, attribution: {} },
            { name: 'LCP', value: 4200, attribution: { element: 'img' } },
          ],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    })
    const view = mount(TraceWebVitalsPanel, {
      props: { group: 'team', project: 'web', traceId: '1'.repeat(32) },
      global: { stubs: { RouterLink: true } },
    })
    await flushPromises()
    expect(view.text()).toContain('0.000')
    expect(view.text()).toContain('4200 ms')
    expect(view.text()).toContain('img')
    expect(view.text()).not.toContain('INP: 0')
  })
  it('reports unavailable data and supports retry', async () => {
    api.webVitalsQuery
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ items: [], total: 0 })
    const view = mount(TraceWebVitalsPanel, {
      props: { group: 'team', project: 'web', traceId: '2'.repeat(32) },
      global: { stubs: { RouterLink: true } },
    })
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toContain('Unable')
    await view.get('button').trigger('click')
    await flushPromises()
    expect(view.text()).toContain('No page experience')
  })
})

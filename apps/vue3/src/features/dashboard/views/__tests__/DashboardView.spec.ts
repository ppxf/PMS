import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const { listGroups, listProjects } = vi.hoisted(() => ({
  listGroups: vi.fn<
    () => Promise<Array<{ id: string; name: string; slug: string; projectCount: number }>>
  >(() =>
    Promise.resolve([
      { id: 'group-1', name: 'Acme', slug: 'acme', projectCount: 2 },
      { id: 'group-2', name: 'Beta', slug: 'beta', projectCount: 1 },
    ]),
  ),
  listProjects: vi.fn<
    (
      slug: string,
    ) => Promise<Array<{ id: string; name: string; slug: string; createdAt: string }>>
  >((slug: string) =>
    Promise.resolve(
      slug === 'acme'
        ? [
            { id: 'p1', name: 'Old App', slug: 'old', createdAt: '2026-09-20T00:00:00Z' },
            { id: 'p2', name: 'Newest App', slug: 'new', createdAt: '2026-09-22T00:00:00Z' },
          ]
        : [{ id: 'p3', name: 'Middle App', slug: 'middle', createdAt: '2026-09-21T00:00:00Z' }],
    ),
  ),
}))

vi.mock('@/features/monitoring/api/monitoring.api', () => ({ listGroups, listProjects }))

import DashboardView from '../DashboardView.vue'

describe('DashboardView', () => {
  it('shows group and project totals with recent projects', async () => {
    const wrapper = mount(DashboardView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('2 个组')
    expect(wrapper.text()).toContain('3 个项目')
    expect(wrapper.text().indexOf('Newest App')).toBeLessThan(wrapper.text().indexOf('Middle App'))
  })
})

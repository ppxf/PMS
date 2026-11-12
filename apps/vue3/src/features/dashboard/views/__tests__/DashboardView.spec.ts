import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
const { getDashboard } = vi.hoisted(() => ({ getDashboard: vi.fn() }))
vi.mock('../../api/dashboard.api', () => ({ getDashboard }))
import DashboardView from '../DashboardView.vue'
const response = () => ({
  start: '2026-11-10T12:00:00Z',
  end: '2026-11-11T12:00:00Z',
  range: '24h',
  groups: [{ id: 'g', name: 'Acme' }],
  totals: { projects: 2, connected: 1, unresolved: 3, events: 12, newIssues: 1 },
  series: [{ at: '2026-11-10T12:00:00Z', count: 12 }],
  issues: [
    {
      id: 'i',
      projectId: 'p1',
      title: 'Checkout failed',
      eventCount: 12,
      firstSeenAt: '2026-11-11T10:00:00Z',
      lastSeenAt: '2026-11-11T11:00:00Z',
      reopenedAt: null,
    },
  ],
  projects: [
    {
      id: 'p1',
      name: 'Storefront',
      slug: 'store',
      groupId: 'g',
      groupName: 'Acme',
      groupSlug: 'acme',
      platform: 'vue',
      lastSeenAt: '2026-11-11T11:00:00Z',
      role: 'owner',
      permissions: ['project:issues:read'],
      unresolved: 3,
      events: 12,
      newIssues: 1,
    },
    {
      id: 'p2',
      name: 'New app',
      slug: 'new',
      groupId: 'g',
      groupName: 'Acme',
      groupSlug: 'acme',
      platform: 'vue',
      lastSeenAt: null,
      role: 'owner',
      permissions: ['project:issues:read'],
      unresolved: 0,
      events: 0,
      newIssues: 0,
    },
  ],
})
async function render() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'dashboard', component: DashboardView },
      ...[
        'groups',
        'project-setup',
        'project-issues',
        'project-issue-detail',
        'project-traces',
        'project-web-vitals',
      ].map((name) => ({
        path: `/${name}/:groupSlug?/:projectSlug?/:issueId?`,
        name,
        component: { template: '<div />' },
      })),
    ],
  })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(DashboardView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}
describe('DashboardView', () => {
  beforeEach(() => {
    getDashboard.mockReset()
    getDashboard.mockResolvedValue(response())
  })
  it('renders issue links, setup guidance, and searches projects', async () => {
    const wrapper = await render()
    expect(wrapper.text()).toContain('Checkout failed')
    expect(wrapper.find('a[href="/project-issue-detail/g/p1/i"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Waiting for SDK')
    await wrapper.get('input[aria-label="Search projects"]').setValue('Store')
    expect(wrapper.find('[data-project="p1"]').exists()).toBe(true)
    expect(wrapper.find('[data-project="p2"]').exists()).toBe(false)
    wrapper.unmount()
  })
  it('shows retry on failure instead of fabricated zero metrics', async () => {
    getDashboard.mockRejectedValueOnce(new Error('offline'))
    const wrapper = await render()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="dashboard-stats"]').exists()).toBe(false)
    await wrapper.get('[data-testid="retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Storefront')
    wrapper.unmount()
  })
  it('uses the selected time range', async () => {
    const wrapper = await render()
    await wrapper.get('select[aria-label="Time range"]').setValue('7d')
    await flushPromises()
    expect(getDashboard).toHaveBeenLastCalledWith({ range: '7d', groupId: undefined })
    wrapper.unmount()
  })
  it('filters the chart by project without changing workspace totals', async () => {
    const result = response()
    Object.assign(result.projects[0]!, { series: [7] })
    getDashboard.mockResolvedValueOnce(result)
    const wrapper = await render()
    await wrapper.get('select[aria-label="Chart project"]').setValue('p1')
    expect(wrapper.text()).toContain('7 error events received in this period.')
    expect(wrapper.get('[data-testid="dashboard-stats"]').text()).toContain('12')
    wrapper.unmount()
  })
  it('hides restricted links and shows a meaningful empty workspace', async () => {
    const result = response()
    result.projects[0]!.permissions = []
    Object.assign(result.projects[0]!, { unresolved: null, events: null })
    result.issues = []
    getDashboard.mockResolvedValueOnce(result)
    const wrapper = await render()
    expect(wrapper.get('[data-project="p1"]').text()).toContain('—')
    expect(wrapper.get('[data-project="p1"]').find('a').exists()).toBe(false)
    wrapper.unmount()
    getDashboard.mockResolvedValueOnce({
      ...result,
      projects: [],
      totals: { projects: 0, connected: 0, unresolved: 0, events: 0, newIssues: 0 },
    })
    const empty = await render()
    expect(empty.text()).toContain('Your monitoring starts here')
    empty.unmount()
  })
  it('distinguishes previously connected totals from activity in the last 24 hours', async () => {
    const value = response()
    value.projects[0]!.lastSeenAt = '2026-11-09T12:00:00Z'
    getDashboard.mockResolvedValueOnce(value)
    const wrapper = await render()
    expect(wrapper.text()).toContain('Previously connected projects')
    expect(wrapper.text()).toContain('No activity in last 24 hours')
    expect(wrapper.text()).toContain('Waiting for SDK')
    wrapper.unmount()
  })

})

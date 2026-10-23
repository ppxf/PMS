import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { selectValue } from '@/test/select'
enableAutoUnmount(afterEach)
const api = vi.hoisted(() => ({
  queryProfiles: vi.fn(),
  profileDetail: vi.fn(),
  profilesConfig: vi.fn(),
  updateProfiles: vi.fn(),
}))
vi.mock('../../api/profiles.api', () => api)
const state = vi.hoisted(
  (): { route?: { params: Record<string, string>; query: Record<string, string> } } => ({}),
)
vi.mock('vue-router', async (original) => {
  const { reactive } = await import('vue')
  state.route = reactive({
    params: { groupSlug: 'team', projectSlug: 'web', profileId: 'p' },
    query: {},
  })
  return { ...(await original<typeof import('vue-router')>()), useRoute: () => state.route }
})
import ProjectProfilesView from '../ProjectProfilesView.vue'
import ProjectProfileDetailView from '../ProjectProfileDetailView.vue'
import ProfileFlameChart from '../../components/ProfileFlameChart.vue'
const profile = {
  profileId: 'p',
  startedAt: '2026-10-23T00:00:00Z',
  name: '<img src=x onerror=alert(1)>',
  durationMs: 30,
  sampleIntervalMs: 10,
  truncated: false,
  traceId: 'trace',
  spanId: 'span',
  resources: ['app.js'],
  frames: [{ name: 'root' }, { name: 'child' }],
  stacks: [{ frameId: 0 }, { frameId: 1, parentId: 0 }],
  samples: [
    { timestamp: 0, stackId: 0 },
    { timestamp: 10, stackId: 1 },
  ],
}
const options = {
  global: {
    stubs: {
      RouterLink: { props: ['to'], template: '<a :data-to="JSON.stringify(to)"><slot /></a>' },
    },
  },
}
beforeEach(() => {
  vi.resetAllMocks()
  state.route!.params = { groupSlug: 'team', projectSlug: 'web', profileId: 'p' }
  state.route!.query = {}
  api.queryProfiles.mockResolvedValue({
    items: [{ ...profile, sampleCount: 2 }],
    total: 21,
    page: 1,
    pageSize: 20,
  })
  api.profilesConfig.mockResolvedValue({ enabled: false, dsn: 'https://key@host/sdk/p' })
  api.updateProfiles.mockResolvedValue({ profilesEnabled: true })
  api.profileDetail.mockResolvedValue(profile)
})
describe('Profiles views', () => {
  it('loads default 24 hours, filters and paginates, and resets page on apply', async () => {
    const view = mount(ProjectProfilesView, options)
    await flushPromises()
    const q = api.queryProfiles.mock.lastCall![2]
    expect(Date.parse(q.end) - Date.parse(q.start)).toBe(86400000)
    expect(view.text()).toContain(profile.name)
    expect(view.find('img').exists()).toBe(false)
    await view.get('button[aria-label="Next page"]').trigger('click')
    await flushPromises()
    expect(api.queryProfiles.mock.lastCall![2].page).toBe(2)
    await view.get('input[aria-label="Environment"]').setValue('production')
    await view.get('input[aria-label="Search profiles"]').setValue('Home')
    await view.get('form').trigger('submit')
    await flushPromises()
    expect(api.queryProfiles.mock.lastCall![2]).toMatchObject({
      environment: 'production',
      search: 'Home',
      page: 1,
    })
    await selectValue(view, 'Time range', '31d')
    await view.get('form').trigger('submit')
    await flushPromises()
    const month = api.queryProfiles.mock.lastCall![2]
    expect(Date.parse(month.end) - Date.parse(month.start)).toBe(31 * 86400000)
  })
  it('enables collection and explains manual, trace, browser and response headers', async () => {
    const view = mount(ProjectProfilesView, options)
    await flushPromises()
    await view.get('button[aria-label="Enable profiles"]').trigger('click')
    await flushPromises()
    expect(api.updateProfiles).toHaveBeenCalledWith('team', 'web', true)
    expect(view.text()).toContain('Profiles enabled')
    expect(view.text()).toContain('Document-Policy')
    expect(view.text()).toContain('Chromium')
    expect(view.text()).toContain('uiProfiler')
    expect(view.text()).toContain('browserTracingIntegration')
  })
  it('shows errors and empty states', async () => {
    api.queryProfiles.mockRejectedValueOnce(new Error('offline'))
    const view = mount(ProjectProfilesView, options)
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toContain('Unable to load profiles')
    api.queryProfiles.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 })
    await view.get('form').trigger('submit')
    await flushPromises()
    expect(view.text()).toContain('No profiles found')
  })
  it('ignores stale list and config responses after project navigation', async () => {
    let finish!: (value: unknown) => void
    let config!: (value: unknown) => void
    api.queryProfiles.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    api.profilesConfig.mockReturnValueOnce(
      new Promise((resolve) => {
        config = resolve
      }),
    )
    const view = mount(ProjectProfilesView, options)
    state.route!.params.projectSlug = 'next'
    await flushPromises()
    finish({ items: [{ ...profile, name: 'stale' }], total: 1, page: 1, pageSize: 20 })
    config({ enabled: true, dsn: 'stale-dsn' })
    await flushPromises()
    expect(view.text()).not.toContain('stale')
    expect(view.find('button[aria-label="Enable profiles"]').exists()).toBe(true)
  })
  it('loads detail, links trace with span, ranks functions and focuses flame chart', async () => {
    const view = mount(ProjectProfileDetailView, options)
    await flushPromises()
    expect(view.text()).toContain('Estimated sampled time')
    expect(view.text()).toContain('Functions')
    expect(view.get('a[data-testid="profile-trace-link"]').attributes('data-to')).toContain(
      'project-trace-detail',
    )
    expect(view.get('a[data-testid="profile-trace-link"]').attributes('data-to')).toContain('span')
    const chart = view.getComponent(ProfileFlameChart)
    await chart
      .findAll('button[data-frame]')
      .find((b) => b.text().includes('child'))!
      .trigger('click')
    expect(chart.text()).toContain('Focused: child')
    expect(chart.findAll('button[data-frame]').some((b) => b.text().includes('root'))).toBe(false)
    await chart.get('button[aria-label="Reset flame chart"]').trigger('click')
    expect(chart.findAll('button[data-frame]').some((b) => b.text().includes('root'))).toBe(true)
    expect(view.find('img').exists()).toBe(false)
  })
  it('handles detail errors and empty samples', async () => {
    api.profileDetail.mockRejectedValueOnce(new Error('404'))
    const view = mount(ProjectProfileDetailView, options)
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toContain('Unable to load profile')
    api.profileDetail.mockResolvedValue({ ...profile, samples: [] })
    await view.get('button[aria-label="Retry profile"]').trigger('click')
    await flushPromises()
    expect(view.text()).toContain('No samples recorded')
  })
  it('ignores detail responses for a previous profile', async () => {
    let finish!: (value: unknown) => void
    api.profileDetail.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const view = mount(ProjectProfileDetailView, options)
    api.profileDetail.mockResolvedValue({ ...profile, name: 'Latest profile', profileId: 'next' })
    state.route!.params.profileId = 'next'
    await flushPromises()
    finish({ ...profile, name: 'Stale profile' })
    await flushPromises()
    expect(view.text()).toContain('Latest profile')
    expect(view.text()).not.toContain('Stale profile')
  })
})

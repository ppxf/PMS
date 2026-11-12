import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { selectValue } from '@/test/select'
import { AppError } from '@/services/http'
enableAutoUnmount(afterEach)
const api = vi.hoisted(() => ({
  queryProfiles: vi.fn(),
  profilesOverview: vi.fn(),
  profileDetail: vi.fn(),
  profilesConfig: vi.fn(),
  updateProfiles: vi.fn(),
  getProject: vi.fn(),
}))
vi.mock('../../api/profiles.api', () => api)
vi.mock('../../api/monitoring.api', () => ({ getProject: api.getProject }))
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
import ProjectProfilesSetupView from '../ProjectProfilesSetupView.vue'
import ProjectProfileDetailView from '../ProjectProfileDetailView.vue'
import ProfileFlameChart from '../../components/ProfileFlameChart.vue'
import ProfileFunctionCard from '../../components/ProfileFunctionCard.vue'
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
  api.profilesOverview.mockResolvedValue({
    profileCount: 2,
    baselineProfileCount: 1,
    durationMs: 60,
    unsampledMs: 0,
    comparisonStart: '2026-10-21T00:00:00Z',
    comparisonEnd: '2026-10-22T00:00:00Z',
    functions: [
      {
        key: 'root',
        name: 'root',
        profileId: 'p',
        count: 2,
        self: { avg: 20, p50: 20, p95: 25 },
        total: { avg: 30, p50: 30, p95: 30 },
        baselineSelfP95: 10,
        changePercent: 150,
      },
    ],
    transactions: [{ name: 'Checkout', profileId: 'p', count: 2, avg: 30, p50: 30, p95: 30 }],
    flamegraph: [{ name: 'root', frameId: 0, stackId: 0, start: 0, end: 60, depth: 0 }],
  })
  api.profilesConfig.mockResolvedValue({ enabled: false, dsn: 'https://key@host/sdk/p' })
  api.getProject.mockResolvedValue({ name: 'Web', dsn: 'https://key@host/sdk/p' })
  api.updateProfiles.mockResolvedValue({ profilesEnabled: true })
  api.profileDetail.mockResolvedValue(profile)
})
describe('Profiles views', () => {
  it('defaults to application functions and restores SDK and framework rows without changing input', async () => {
    const data = await api.profilesOverview()
    const base = data.functions[0]
    const functions = [
      { ...base, key: 'business', name: 'startProfiler', resource: '/src/business.ts' },
      {
        ...base,
        key: 'sdk',
        name: 'sdkInternal',
        resource: '/node_modules/.vite/deps/@pms_monitoring-vue.js',
      },
      { ...base, key: 'vue', name: 'patchDOMProp', resource: '/node_modules/vue/runtime.js' },
      { ...base, key: 'unknown', name: 'unknownFrame' },
    ]
    const view = mount(ProfileFunctionCard, {
      ...options,
      props: {
        functions,
        initialMode: 'p95',
        group: 'team',
        project: 'web',
        loading: false,
        failed: false,
      },
    })
    const names = () => view.findAll('ol a').map((a) => a.text())
    expect(names()).toEqual(['startProfiler', 'unknownFrame'])
    await selectValue(view, 'p95 function scope', 'all')
    expect(names()).toContain('sdkInternal')
    expect(names()).toContain('patchDOMProp')
    await selectValue(view, 'p95 function scope', 'application')
    expect(names()).toEqual(['startProfiler', 'unknownFrame'])
    expect(functions).toHaveLength(4)
  })
  it('switches function percentiles, time metrics and improvement rankings independently', async () => {
    const data = await api.profilesOverview()
    data.functions.push({
      ...data.functions[0],
      key: 'fast',
      name: 'improved',
      profileId: 'p2',
      self: { avg: 2, p50: 2, p95: 2 },
      total: { avg: 50, p50: 50, p95: 50 },
      changePercent: -50,
    })
    const view = mount(ProfileFunctionCard, {
      ...options,
      props: {
        functions: data.functions,
        initialMode: 'p95',
        group: 'team',
        project: 'web',
        loading: false,
        failed: false,
      },
    })
    expect(view.findAll('li')[0]!.text()).toContain('root')
    await selectValue(view, 'Function time metric', 'total')
    expect(view.findAll('li')[0]!.text()).toContain('improved')
    await selectValue(view, 'p95 function ranking', 'avg')
    expect(view.findAll('li')[0]!.text()).toContain('50.00 ms')
    await selectValue(view, 'p95 function ranking', 'improved')
    expect(view.findAll('li')).toHaveLength(1)
    expect(view.text()).toContain('-50.0%')
    await selectValue(view, 'p95 function ranking', 'regressed')
    expect(view.findAll('li')[0]!.text()).toContain('root')
  })
  it('reports backend aggregation limits, retries statistics and keeps raw profiles available', async () => {
    api.profilesOverview.mockRejectedValueOnce(
      new AppError('Please narrow the time range', { status: 400 }),
    )
    const view = mount(ProjectProfilesView, options)
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toContain('Please narrow')
    expect(view.text()).not.toContain('No functions found')
    await view
      .findAll('button')
      .find((b) => b.text() === 'Retry statistics')!
      .trigger('click')
    await flushPromises()
    expect(view.find('[role="alert"]').exists()).toBe(false)
    expect(view.text()).toContain('Checkout')
    await view.get('[data-testid="profiles-tab"]').trigger('click')
    expect(view.text()).toContain(profile.name)
  })
  it('ignores stale overview data after changing project', async () => {
    const stale = structuredClone(await api.profilesOverview())
    stale.functions[0].name = 'Stale function'
    let finish!: (value: unknown) => void
    api.profilesOverview.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const view = mount(ProjectProfilesView, options)
    state.route!.params.projectSlug = 'next'
    await flushPromises()
    finish(stale)
    await flushPromises()
    expect(view.text()).not.toContain('Stale function')
    expect(api.profilesOverview.mock.lastCall![1]).toBe('next')
  })
  it('shows function rankings, transaction percentiles and an aggregate flamegraph', async () => {
    const view = mount(ProjectProfilesView, options)
    await flushPromises()
    expect(api.profilesOverview).toHaveBeenCalledWith(
      'team',
      'web',
      expect.objectContaining({ start: expect.any(String), end: expect.any(String) }),
    )
    expect(view.text()).toContain('Slowest Functions')
    expect(view.text()).toContain('Most Regressed Functions')
    expect(view.text()).toContain('150.0%')
    expect(view.get('[role="tab"][aria-selected="true"]').text()).toContain('Transactions')
    expect(view.text()).toContain('Checkout')
    expect(view.text()).toContain('AVG')
    expect(view.text()).toContain('P95')
    expect(view.text()).not.toContain('P75')
    expect(view.text()).not.toContain('P99')
    await view.get('[data-testid="aggregate-tab"]').trigger('click')
    expect(view.getComponent(ProfileFlameChart).props('durationMs')).toBe(60)
    await view.get('[data-testid="profiles-tab"]').trigger('click')
    expect(view.text()).toContain(profile.name)
  })
  it('sorts and paginates transactions, supports keyboard tabs, and drills into matching profiles', async () => {
    const data = await api.profilesOverview()
    data.transactions = Array.from({ length: 22 }, (_, i) => ({
      ...data.transactions[0],
      name: `Transaction ${i}`,
      count: i + 1,
    }))
    const view = mount(ProjectProfilesView, options)
    await flushPromises()
    const panel = () => view.get('#profile-panel-transactions')
    expect(panel().findAll('tbody tr')).toHaveLength(20)
    expect(panel().findAll('tbody tr')[0]!.text()).toContain('Transaction 21')
    await view.get('button[aria-label="Next transactions"]').trigger('click')
    expect(panel().findAll('tbody tr')).toHaveLength(2)
    await panel()
      .findAll('th button')
      .find((b) => b.text().includes('Count'))!
      .trigger('click')
    expect(panel().findAll('tbody tr')[0]!.text()).toContain('Transaction 0')
    await panel().findAll('tbody tr')[0]!.get('button').trigger('click')
    await flushPromises()
    expect(view.get('[data-testid="profiles-tab"]').attributes('aria-selected')).toBe('true')
    expect(api.queryProfiles.mock.lastCall![2].search).toBe('Transaction 0')
    await view.get('[data-testid="profiles-tab"]').trigger('keydown', { key: 'Home' })
    expect(view.get('[data-testid="transactions-tab"]').attributes('aria-selected')).toBe('true')
  })
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
    expect(q.environment).toBe('development')
    expect(q).not.toHaveProperty('traceId')
    expect(view.find('input[aria-label="Trace ID"]').exists()).toBe(false)
    expect(view.find('input[aria-label="Environment"]').exists()).toBe(false)
    await selectValue(view, 'Environment', 'production')
    expect(api.queryProfiles.mock.lastCall![2]).toMatchObject({ environment: 'production', page: 1 })
    expect(api.profilesOverview.mock.lastCall![2]).toMatchObject({ environment: 'production' })
    await view.get('input[aria-label="Search profiles"]').setValue('Home')
    await view.get('form').trigger('submit')
    await flushPromises()
    expect(api.queryProfiles.mock.lastCall![2]).toMatchObject({
      environment: 'production',
      search: 'Home',
      page: 1,
    })
    await selectValue(view, 'Time range', '31d')
    await flushPromises()
    const month = api.queryProfiles.mock.lastCall![2]
    expect(Date.parse(month.end) - Date.parse(month.start)).toBe(31 * 86400000)
  })
  it('keeps collection settings and the setup guide off the list page', async () => {
    const view = mount(ProjectProfilesView, options)
    await flushPromises()
    expect(view.find('button[aria-label="Enable profiles"]').exists()).toBe(false)
    expect(api.profilesConfig).not.toHaveBeenCalled()
    expect(view.text()).not.toContain('Document-Policy')
  })
  it('shows the project-specific guide on the Profiles setup page', async () => {
    const view = mount(ProjectProfilesSetupView, options)
    await flushPromises()
    expect(api.getProject).toHaveBeenCalledWith('team', 'web')
    expect(view.get('h1').text()).toBe('Profiles setup')
    expect(view.text()).toContain('https://key@host/sdk/p')
    expect(view.text()).toContain('Document-Policy')
    expect(view.text()).toContain('Chromium')
    expect(view.text()).toContain('uiProfiler')
    expect(view.text()).toContain('browserTracingIntegration')
    expect(view.text()).not.toContain('Verify profiling permission')
    expect(view.text()).not.toContain('checkProfiling()')
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
  it('ignores stale list responses after project navigation', async () => {
    let finish!: (value: unknown) => void
    api.queryProfiles.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const view = mount(ProjectProfilesView, options)
    state.route!.params.projectSlug = 'next'
    await flushPromises()
    finish({ items: [{ ...profile, name: 'stale' }], total: 1, page: 1, pageSize: 20 })
    await flushPromises()
    expect(view.text()).not.toContain('stale')
    expect(view.find('button[aria-label="Enable profiles"]').exists()).toBe(false)
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

import { beforeEach as beforeProjectAccessTest } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectAccessStore } from '../../model/project-access.store'
beforeProjectAccessTest(() => {
  setActivePinia(createPinia())
  useProjectAccessStore().access = { projectId: 'test-project', role: 'owner', permissions: [] }
})
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import ProjectWebVitalsView from '../ProjectWebVitalsView.vue'
import { selectValue } from '@/test/select'

const mocks = vi.hoisted(() => ({ request: vi.fn(), replace: vi.fn() }))
const route = reactive({
  name: 'project-web-vitals',
  fullPath: '/vitals',
  params: { groupSlug: 'a', projectSlug: 'b' },
  query: {},
})
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace: mocks.replace }),
  RouterLink: { props: ['to'], template: '<a><slot /></a>' },
}))
vi.mock('../../api/web-vitals.api', () => ({ webVitalsQuery: mocks.request }))
vi.mock('vue-echarts', () => ({ default: { template: '<div />' } }))
enableAutoUnmount(afterEach)
afterEach(() => vi.useRealTimers())
beforeEach(() => {
  route.name = 'project-web-vitals'
  route.query = {}
  route.fullPath = '/vitals'
  mocks.request.mockReset()
  mocks.replace.mockReset()
  mocks.request.mockImplementation((_g, _p, resource) =>
    Promise.resolve(
      resource === 'overview'
        ? {
            pageViews: 0,
            completeSamples: 0,
            passingSamples: 0,
            passRate: null,
            coverage: 0,
            metrics: [],
            lastReceivedAt: null,
          }
        : { items: [], total: 0 },
    ),
  )
})
describe('Web Vitals', () => {
  it('keeps successful modules visible and retries only a failed overview', async () => {
    mocks.request.mockImplementation((_g, _p, resource) =>
      resource === 'overview'
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(
            resource === 'pages'
              ? {
                  items: [{ route: '/slow', pageViews: 3, metrics: [], poorPageViews: 1 }],
                  total: 1,
                }
              : { items: [], total: 0 },
          ),
    )
    const view = mount(ProjectWebVitalsView)
    await flushPromises()
    expect(view.text()).toContain('/slow')
    expect(view.text()).not.toContain('No Web Vitals received')
    const before = mocks.request.mock.calls.length
    mocks.request.mockResolvedValue({
      pageViews: 3,
      completeSamples: 0,
      passingSamples: 0,
      passRate: null,
      coverage: 0,
      metrics: [],
      lastReceivedAt: null,
    })
    await view.get('button[class*="underline"]').trigger('click')
    await flushPromises()
    expect(mocks.request.mock.calls.slice(before).map((call) => call[2])).toEqual(['overview'])
    expect(view.find('[role="alert"]').exists()).toBe(false)
  })
  it('preserves the same time window when changing page', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-06T12:00:00Z'))
    const view = mount(ProjectWebVitalsView)
    await flushPromises()
    const first = mocks.request.mock.calls[0]![3]
    vi.setSystemTime(new Date('2026-11-06T13:00:00Z'))
    route.query = { page: '2' }
    route.fullPath = '/vitals?page=2'
    await flushPromises()
    const second = mocks.request.mock.calls.find((call) => call[3].page === 2)![3]
    expect(second.start).toBe(first.start)
    expect(second.end).toBe(first.end)
    view.unmount()
  })
  it('shows insufficient data rather than a zero pass score', async () => {
    const view = mount(ProjectWebVitalsView)
    await flushPromises()
    expect(view.text()).toContain('No Web Vitals received')
    expect(view.text()).toContain('Insufficient data')
    expect(view.text()).not.toContain('0% complete')
  })
  it('sends only supported filters and uses controlled device selection', async () => {
    route.query = { range: '7d', device: 'mobile', samplePage: '8' }
    const view = mount(ProjectWebVitalsView)
    await flushPromises()
    const query = mocks.request.mock.calls[0]?.[3]
    expect(query).toMatchObject({ device: 'mobile', page: 1, pageSize: 20 })
    expect(query).not.toHaveProperty('range')
    expect(query).not.toHaveProperty('samplePage')
    await selectValue(view, 'Device', 'desktop')
    expect(mocks.replace).toHaveBeenCalledWith({
      query: {
        range: '7d',
        device: 'desktop',
        environment: undefined,
        route: undefined,
        traceId: undefined,
        page: undefined,
      },
    })
  })
  it('removes free text and dates and ignores obsolete URL filters', async () => {
    route.query = {
      start: '2020-01-01T00:00:00Z',
      end: '2020-01-02T00:00:00Z',
      release: 'old',
      browser: 'Chrome',
      range: '24h',
    }
    const view = mount(ProjectWebVitalsView)
    await flushPromises()
    expect(view.find('input').exists()).toBe(false)
    expect(view.find('select').exists()).toBe(false)
    const query = mocks.request.mock.calls[0]![3]
    expect(query).not.toHaveProperty('release')
    expect(query).not.toHaveProperty('browser')
    expect(Date.parse(query.end) - Date.parse(query.start)).toBe(86400000)
    expect(query.start).not.toBe('2020-01-01T00:00:00Z')
  })
  it('renders details and paginates samples', async () => {
    route.name = 'project-web-vitals-detail'
    route.query = { route: '/checkout', page: '2' }
    const view = mount(ProjectWebVitalsView)
    await flushPromises()
    expect(view.text()).toContain('/checkout')
    expect(view.get('button[aria-label="Previous samples"]').text()).toBe('Previous')
    expect(view.text()).not.toContain('No matching pages')
    expect(
      mocks.request.mock.calls.some((call) => call[2] === 'samples' && call[3].page === 2),
    ).toBe(true)
  })
  it('aborts prior filters and ignores late overview responses', async () => {
    let resolveOld: (value: unknown) => void = () => {}
    mocks.request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve
        }),
    )
    const view = mount(ProjectWebVitalsView)
    const oldSignal = mocks.request.mock.calls[0]?.[4] as AbortSignal
    route.fullPath = '/vitals?device=mobile'
    await flushPromises()
    resolveOld({ pageViews: 999, completeSamples: 999, passRate: 1, coverage: 1, metrics: [] })
    await flushPromises()
    expect(oldSignal.aborted).toBe(true)
    expect(view.text()).not.toContain('999')
  })
})

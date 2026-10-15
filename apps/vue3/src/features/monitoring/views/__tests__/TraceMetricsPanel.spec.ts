import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
enableAutoUnmount(afterEach)
const api = vi.hoisted(() => ({ traceMetrics: vi.fn() }))
vi.mock('../../api/metrics.api', () => api)
import TraceMetricsPanel from '../../components/TraceMetricsPanel.vue'
const samples = [
  {
    eventId: 'batch',
    sampleIndex: 0,
    name: 'orders',
    type: 'count',
    unit: 'none',
    value: 1,
    timestamp: '2026-10-14T00:00:00Z',
    attributes: { route: '/' },
    traceId: 'trace',
    spanId: 'child',
    environment: 'prod',
    release: 'v1',
  },
  {
    eventId: 'batch',
    sampleIndex: 1,
    name: 'response_time',
    type: 'distribution',
    unit: 'millisecond',
    value: 200,
    timestamp: '2026-10-14T00:00:00Z',
    attributes: {},
    traceId: 'trace',
    spanId: 'root',
  },
]
const props = { group: 'team', project: 'web', traceId: 'trace', selectedSpanId: 'child' }
describe('Trace application metrics', () => {
  beforeEach(() => {
    api.traceMetrics.mockReset().mockResolvedValue({ total: 21, page: 1, pageSize: 20, samples })
  })
  it('renders heterogeneous metric samples and navigates back to the associated span', async () => {
    const view = mount(TraceMetricsPanel, { props })
    await flushPromises()
    expect(view.text()).toContain('orders')
    expect(view.text()).toContain('distribution')
    expect(view.text()).toContain('200 millisecond')
    await view.get('button[aria-label="View span child"]').trigger('click')
    expect(view.emitted('selectSpan')).toEqual([['child']])
    await view.get('button[aria-label="Next metrics page"]').trigger('click')
    await flushPromises()
    expect(api.traceMetrics.mock.lastCall).toEqual([
      'team',
      'web',
      'trace',
      { page: 2, pageSize: 20 },
    ])
  })
  it('shows attribute counts and expandable values with no disclosure for empty attributes', async () => {
    const view = mount(TraceMetricsPanel, { props })
    await flushPromises()
    const rows = view.findAll('tbody tr')
    expect(rows[0]!.get('summary').text()).toBe('Attributes (1)')
    rows[0]!.get('details').element.open = true
    await rows[0]!.get('summary').trigger('toggle')
    expect(rows[0]!.get('details ul').text()).toContain('route')
    expect(rows[0]!.get('details ul').text()).toContain('/')
    expect(rows[1]!.find('details').exists()).toBe(false)
  })
  it('searches metric names and restricts to the selected span while resetting pagination', async () => {
    const view = mount(TraceMetricsPanel, { props })
    await flushPromises()
    await view.get('input[aria-label="Search related metrics"]').setValue('orders')
    await view.get('form').trigger('submit')
    await flushPromises()
    await view.get('input[aria-label="Metrics for selected span only"]').setValue(true)
    await flushPromises()
    expect(api.traceMetrics.mock.lastCall).toEqual([
      'team',
      'web',
      'trace',
      { page: 1, pageSize: 20, search: 'orders', spanId: 'child' },
    ])
  })
  it('ignores stale project responses and retries failed queries', async () => {
    let resolveOld!: (value: unknown) => void
    api.traceMetrics.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve
      }),
    )
    const view = mount(TraceMetricsPanel, { props })
    await view.setProps({ project: 'other' })
    await flushPromises()
    resolveOld({ total: 1, page: 1, pageSize: 20, samples: [{ ...samples[0], name: 'stale' }] })
    await flushPromises()
    expect(view.text()).not.toContain('stale')
    api.traceMetrics.mockRejectedValueOnce(new Error('offline'))
    await view.get('form').trigger('submit')
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toContain('Unable to load related metrics')
    await view.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(view.find('[role="alert"]').exists()).toBe(false)
  })
})

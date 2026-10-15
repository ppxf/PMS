import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'

const routeState = vi.hoisted(() => ({
  route: null as null | { name?: string; params: { groupSlug: string; projectSlug: string } },
}))

const {
  createProject,
  getProject,
  getProjectConnection,
  updateProjectOrigins,
  updateProjectTracing,
  updateProjectMetrics,
  updateProjectLogging,
  updateProjectErrorMonitoring,
  push,
  writeText,
} = vi.hoisted(() => ({
  updateProjectOrigins: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  createProject: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  getProject: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  getProjectConnection: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  updateProjectTracing: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  updateProjectMetrics: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  updateProjectLogging: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  updateProjectErrorMonitoring: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  push: vi.fn<(...args: unknown[]) => unknown>(),
  writeText: vi.fn<(value: string) => Promise<void>>(() => Promise.resolve()),
}))

vi.mock('../../api/monitoring.api', () => ({
  createProject,
  getProject,
  getProjectConnection,
  updateProjectOrigins,
  updateProjectTracing,
  updateProjectMetrics,
  updateProjectLogging,
  updateProjectErrorMonitoring,
}))
vi.mock('vue-router', async (importOriginal) => {
  const { reactive } = await import('vue')
  routeState.route = reactive({ params: { groupSlug: 'acme', projectSlug: 'frontend' } })
  return {
    ...(await importOriginal<typeof import('vue-router')>()),
    useRoute: () => routeState.route,
    useRouter: () => ({ push }),
  }
})

import CreateProjectView from '../CreateProjectView.vue'
import ProjectDetailView from '../ProjectDetailView.vue'
import ProjectSetupView from '../ProjectSetupView.vue'

const project = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  groupId: 'group-1',
  name: 'Frontend',
  slug: 'frontend',
  platform: 'vue',
  errorMonitoringEnabled: true,
  loggingEnabled: false,
  tracingEnabled: false,
  metricsEnabled: false,
  dsn: 'http://abc123@localhost:3001/api/sdk/550e8400-e29b-41d4-a716-446655440000',
  connected: false,
  lastSeenAt: null,
  createdAt: '2026-09-22T00:00:00Z',
  updatedAt: '2026-09-22T00:00:00Z',
}

const RouterLinkStub = defineComponent({
  name: 'RouterLink',
  props: { to: { type: Object, required: true } },
  template: '<a><slot /></a>',
})

describe('project views', () => {
  it('provides scoped Metrics setup and copyable usage without changing basic setup', async () => {
    getProject.mockResolvedValue({ ...project })
    routeState.route!.name = 'project-metrics-setup'
    const view = mount(ProjectSetupView, { global: { stubs: { RouterLink: RouterLinkStub } } })
    await flushPromises()
    expect(view.get('h2').text()).toBe('Metrics setup')
    expect(view.get('[data-testid="init-snippet"]').text()).toContain('enableMetrics: true')
    expect(view.get('[data-testid="init-snippet"]').text()).not.toContain(
      'browserTracingIntegration',
    )
    const usage = view.get('[data-testid="metrics-usage-snippet"]').text()
    expect(usage).toContain("metrics.count('button_click', 1")
    expect(usage).toContain("metrics.gauge('cart_items', 3")
    expect(usage).toContain("metrics.distribution('checkout_duration'")
    await view.get('[data-testid="copy-metrics-usage"]').trigger('click')
    expect(writeText).toHaveBeenLastCalledWith(usage)
    expect(view.get('[data-testid="metrics-disabled"]').text()).toContain('Application Metrics')
    routeState.route!.name = 'project-setup'
    await flushPromises()
    expect(view.find('[data-testid="metrics-usage-snippet"]').exists()).toBe(false)
    expect(view.get('[data-testid="init-snippet"]').text()).not.toContain('enableMetrics')
    view.unmount()
  })
  it.each([
    ['Error Monitoring', 'errorMonitoringEnabled', updateProjectErrorMonitoring],
    ['Logging', 'loggingEnabled', updateProjectLogging],
    ['Tracing', 'tracingEnabled', updateProjectTracing],
    ['Application Metrics', 'metricsEnabled', updateProjectMetrics],
  ] as const)('toggles %s directly from its feature status', async (label, key, update) => {
    getProject.mockResolvedValue({ ...project, [key]: false })
    update
      .mockResolvedValueOnce({ ...project, [key]: true })
      .mockResolvedValueOnce({ ...project, [key]: false })
    const view = mount(ProjectDetailView)
    await flushPromises()
    const status = () => view.get(`[role="switch"][aria-label="${label}"]`)
    expect(status().attributes('aria-checked')).toBe('false')
    await status().trigger('click')
    await flushPromises()
    expect(update).toHaveBeenLastCalledWith('acme', 'frontend', true)
    expect(status().text()).toBe('Enabled')
    await status().trigger('click')
    await flushPromises()
    expect(update).toHaveBeenLastCalledWith('acme', 'frontend', false)
    expect(status().attributes('aria-checked')).toBe('false')
    expect(view.findAll('[role="switch"]')).toHaveLength(4)
    expect(view.findAll('input[type="checkbox"]')).toHaveLength(0)
    expect(view.findAll('button')).toHaveLength(4)
    view.unmount()
  })
  it('keeps controls available after a failed save and disables all toggles while saving', async () => {
    getProject.mockResolvedValue({ ...project })
    let rejectSave!: (reason: Error) => void
    updateProjectMetrics.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectSave = reject
        }),
    )
    const view = mount(ProjectDetailView)
    await flushPromises()
    await view.get('[role="switch"][aria-label="Application Metrics"]').trigger('click')
    expect(
      view
        .findAll('[role="switch"]')
        .every((control) => control.attributes('disabled') !== undefined),
    ).toBe(true)
    await view.get('[role="switch"][aria-label="Tracing"]').trigger('click')
    expect(updateProjectTracing).not.toHaveBeenCalled()
    rejectSave(new Error('offline'))
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toContain('Unable to update Application Metrics')
    expect(
      view.get('[role="switch"][aria-label="Application Metrics"]').attributes('aria-checked'),
    ).toBe('false')
    updateProjectMetrics.mockResolvedValueOnce({ ...project, metricsEnabled: true })
    await view.get('[role="switch"][aria-label="Application Metrics"]').trigger('click')
    await flushPromises()
    expect(view.find('[role="alert"]').exists()).toBe(false)
    expect(
      view.get('[role="switch"][aria-label="Application Metrics"]').attributes('aria-checked'),
    ).toBe('true')
    view.unmount()
  })
  it('does not apply a pending feature save to a different project', async () => {
    getProject
      .mockResolvedValueOnce({ ...project })
      .mockResolvedValueOnce({ ...project, name: 'Second', slug: 'second' })
    let finishSave!: (value: unknown) => void
    updateProjectMetrics.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSave = resolve
        }),
    )
    const view = mount(ProjectDetailView)
    await flushPromises()
    await view.get('[role="switch"][aria-label="Application Metrics"]').trigger('click')
    routeState.route!.params = { groupSlug: 'acme', projectSlug: 'second' }
    await flushPromises()
    finishSave({ ...project, metricsEnabled: true })
    await flushPromises()
    expect(view.get('h2').text()).toBe('Second')
    expect(
      view.get('[role="switch"][aria-label="Application Metrics"]').attributes('aria-checked'),
    ).toBe('false')
    view.unmount()
  })
  it('keeps basic setup focused on errors and separates the Traces instructions', async () => {
    getProject.mockResolvedValue({ ...project, tracingEnabled: true })
    const wrapper = mount(ProjectSetupView)
    await flushPromises()
    expect(wrapper.get('[data-testid="init-snippet"]').text()).not.toContain(
      'browserTracingIntegration',
    )
    expect(wrapper.text()).not.toContain('pnpm add @pms/monitoring-vue @pms/monitoring-browser')
    routeState.route!.name = 'project-traces-setup'
    await flushPromises()
    expect(wrapper.text()).toContain('Traces setup')
    expect(wrapper.get('[data-testid="init-snippet"]').text()).toContain(
      'integrations: [browserTracingIntegration()]',
    )
    await wrapper.get('[data-testid="copy-init"]').trigger('click')
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('tracesSampleRate:'))
    const manualSnippet = wrapper.get('[data-testid="manual-trace-snippet"]').text()
    expect(manualSnippet).toContain("import { startSpan, flush } from '@pms/monitoring-vue'")
    expect(manualSnippet).toContain("name: 'Manual trace test'")
    expect(manualSnippet).toContain("op: 'business', parent")
    expect(manualSnippet).toContain('await flush()')
    expect(wrapper.get('[data-testid="manual-trace-setup"]').text()).toContain('All spans')
    await wrapper.get('[data-testid="copy-manual-trace"]').trigger('click')
    expect(writeText).toHaveBeenLastCalledWith(manualSnippet)
    expect(wrapper.text()).not.toContain("captureException(new Error('PMS SDK test error'))")
    wrapper.unmount()
  })
  beforeEach(() => {
    vi.clearAllMocks()
    updateProjectOrigins.mockReset()
    routeState.route!.name = 'project-setup'
    routeState.route!.params = { groupSlug: 'acme', projectSlug: 'frontend' }
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
  })

  it('creates a Vue project with the expected default switches', async () => {
    createProject.mockResolvedValue({ ...project })
    const wrapper = mount(CreateProjectView)

    expect(wrapper.text()).toContain('Vue')
    expect(wrapper.text()).not.toContain('Replay')
    expect(wrapper.get('[data-testid="error-switch"]').attributes('data-state')).toBe('checked')
    expect(wrapper.get('[data-testid="logging-switch"]').attributes('data-state')).toBe('unchecked')

    await wrapper.get('input[name="name"]').setValue('Frontend')
    await wrapper.get('[data-testid="logging-switch"]').trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(createProject).toHaveBeenCalledWith('acme', {
      name: 'Frontend',
      platform: 'vue',
      errorMonitoringEnabled: true,
      loggingEnabled: true,
      tracingEnabled: false,
      metricsEnabled: false,
    })
    expect(push).toHaveBeenCalledWith({
      name: 'project-setup',
      params: { groupSlug: 'acme', projectSlug: 'frontend' },
    })
  })

  it('shows copyable SDK instructions and refreshes connection status', async () => {
    getProject.mockResolvedValue({ ...project })
    getProjectConnection.mockResolvedValue({
      connected: true,
      lastSeenAt: '2026-09-22T08:00:00Z',
    })
    const wrapper = mount(ProjectSetupView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain(project.dsn)
    expect(wrapper.text()).toContain('pnpm add @pms/monitoring-vue')
    expect(wrapper.find('[data-testid="browser-traces-setup"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('VITE_PMS_DSN=')
    expect(wrapper.text()).toContain("from '@pms/monitoring-vue'")
    expect(wrapper.text()).toContain('initPmsMonitoring')
    expect(wrapper.text()).toContain("captureException(new Error('PMS SDK test error'))")
    expect(wrapper.text()).toContain('Initialization sends a connection report')
    expect(wrapper.text()).toContain('Vue, window.error, and unhandledrejection')
    expect(wrapper.text()).toContain('manual verification or reporting')
    expect(wrapper.text()).not.toContain('release:')
    expect(wrapper.text()).not.toContain('VITE_RELEASE')
    expect(wrapper.text()).not.toContain('Back to group details')
    expect(wrapper.text()).not.toContain('Open project details')
    expect(wrapper.text()).not.toContain('/api/sdk/check')
    expect(wrapper.text()).not.toContain('fetch(')
    await wrapper.get('[data-testid="copy-dsn"]').trigger('click')
    expect(writeText).toHaveBeenCalledWith(project.dsn)

    await wrapper.get('[data-testid="refresh-connection"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Connected')
  })

  it('copies direct init without binding and defaults to any origin', async () => {
    getProject.mockResolvedValue({ ...project })
    const wrapper = mount(ProjectSetupView)
    await flushPromises()
    const snippet = wrapper.get('[data-testid="init-snippet"]').text()
    expect(snippet).toContain('initPmsMonitoring({')
    expect(snippet).not.toContain('bindingCode')
    expect(wrapper.text()).not.toContain('Authorization code')
    expect(wrapper.text()).not.toContain('bindProject')
    expect(wrapper.get('[data-testid="allowed-origins"]').text()).toContain('All origins allowed')
    expect(
      (wrapper.get('[data-testid="origins-input"]').element as HTMLTextAreaElement).value,
    ).toBe('*')
    await wrapper.get('[data-testid="copy-init"]').trigger('click')
    expect(writeText).toHaveBeenCalledWith(snippet)
    expect(updateProjectOrigins).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('saves exact project origins and supports wildcard and empty policy', async () => {
    getProject.mockResolvedValue({ ...project, allowedOrigins: ['https://old.example.com'] })
    updateProjectOrigins.mockResolvedValue({
      ...project,
      allowedOrigins: ['https://app.example.com', 'http://localhost:5173'],
    })
    const wrapper = mount(ProjectSetupView)
    await flushPromises()
    await wrapper
      .get('[data-testid="origins-input"]')
      .setValue('https://app.example.com\nhttp://localhost:5173')
    await wrapper.get('[data-testid="save-origins"]').trigger('click')
    await flushPromises()
    expect(updateProjectOrigins).toHaveBeenCalledWith('acme', 'frontend', [
      'https://app.example.com',
      'http://localhost:5173',
    ])
    expect(wrapper.get('[data-testid="allowed-origins"]').text()).toContain(
      'https://app.example.com',
    )
    updateProjectOrigins.mockResolvedValueOnce({ ...project, allowedOrigins: ['*'] })
    await wrapper.get('[data-testid="origins-input"]').setValue('*')
    await wrapper.get('[data-testid="save-origins"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="allowed-origins"]').text()).toContain('All origins allowed')
    updateProjectOrigins.mockResolvedValueOnce({ ...project, allowedOrigins: [] })
    await wrapper.get('[data-testid="origins-input"]').setValue('')
    await wrapper.get('[data-testid="save-origins"]').trigger('click')
    await flushPromises()
    expect(updateProjectOrigins).toHaveBeenLastCalledWith('acme', 'frontend', [])
    expect(wrapper.get('[data-testid="allowed-origins"]').text()).toContain(
      'Browser origins blocked',
    )
    wrapper.unmount()
  })

  it('rejects non-origin values and displays save failures without changing the policy', async () => {
    getProject.mockResolvedValue({ ...project, allowedOrigins: ['*'] })
    const wrapper = mount(ProjectSetupView)
    await flushPromises()
    for (const input of [
      'https://app.example.com/path',
      '*\nhttps://app.example.com',
      'ftp://example.com',
    ]) {
      await wrapper.get('[data-testid="origins-input"]').setValue(input)
      await wrapper.get('[data-testid="save-origins"]').trigger('click')
      expect(wrapper.text()).toContain('Enter an exact http(s) origin on each line')
    }
    await wrapper
      .get('[data-testid="origins-input"]')
      .setValue(Array.from({ length: 21 }, (_, i) => `https://app${i}.example.com`).join('\n'))
    await wrapper.get('[data-testid="save-origins"]').trigger('click')
    expect(wrapper.text()).toContain('Up to 20 origins are allowed')
    expect(updateProjectOrigins).not.toHaveBeenCalled()
    updateProjectOrigins.mockRejectedValueOnce(new Error('failed'))
    await wrapper.get('[data-testid="origins-input"]').setValue('https://app.example.com')
    await wrapper.get('[data-testid="save-origins"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Unable to save origin settings')
    expect(wrapper.get('[data-testid="allowed-origins"]').text()).toContain('All origins allowed')
    wrapper.unmount()
  })

  it('discards a saved origin response after switching projects', async () => {
    getProject.mockResolvedValue({ ...project, allowedOrigins: ['*'] })
    let resolveSave!: (value: unknown) => void
    updateProjectOrigins.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve
      }),
    )
    const wrapper = mount(ProjectSetupView)
    await flushPromises()
    await wrapper.get('[data-testid="origins-input"]').setValue('https://previous.example.com')
    await wrapper.get('[data-testid="save-origins"]').trigger('click')
    getProject.mockResolvedValue({
      ...project,
      slug: 'other-project',
      allowedOrigins: ['https://current.example.com'],
    })
    routeState.route!.params.projectSlug = 'other-project'
    await flushPromises()
    resolveSave({ ...project, allowedOrigins: ['https://previous.example.com'] })
    await flushPromises()
    expect(wrapper.get('[data-testid="allowed-origins"]').text()).toContain(
      'https://current.example.com',
    )
    expect(wrapper.get('[data-testid="allowed-origins"]').text()).not.toContain(
      'https://previous.example.com',
    )
    wrapper.unmount()
  })

  it('shows project configuration without monitoring event data', async () => {
    getProject.mockResolvedValue({ ...project })
    const wrapper = mount(ProjectDetailView, {
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Frontend')
    expect(wrapper.text()).toContain('Error Monitoring')
    expect(wrapper.text()).toContain('Awaiting connection')
    expect(wrapper.text()).not.toContain('Replay')
    expect(wrapper.text()).not.toContain('View errors')
    expect(wrapper.text()).not.toContain('View SDK setup instructions')
    expect(wrapper.findComponent({ name: 'RouterLink' }).exists()).toBe(false)
  })
})

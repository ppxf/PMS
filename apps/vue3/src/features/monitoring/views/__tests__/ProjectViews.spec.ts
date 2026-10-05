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
  push,
  writeText,
} = vi.hoisted(() => ({
  updateProjectOrigins: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  createProject: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  getProject: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  getProjectConnection: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  updateProjectTracing: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  updateProjectMetrics: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
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
  it('enables Metrics from project configuration', async () => {
    getProject.mockResolvedValue({ ...project })
    updateProjectMetrics.mockResolvedValue({ ...project, metricsEnabled: true })
    const view = mount(ProjectDetailView)
    await flushPromises()
    await view.get('input[type="checkbox"]').setValue(true)
    await flushPromises()
    expect(updateProjectMetrics).toHaveBeenCalledWith('acme', 'frontend', true)
    expect((view.get('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true)
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
    expect(wrapper.text()).toContain('Traces接入')
    expect(wrapper.get('[data-testid="init-snippet"]').text()).toContain(
      'integrations: [browserTracingIntegration()]',
    )
    await wrapper.get('[data-testid="copy-init"]').trigger('click')
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('tracesSampleRate:'))
    const manualSnippet = wrapper.get('[data-testid="manual-trace-snippet"]').text()
    expect(manualSnippet).toContain("import { startSpan, flush } from '@pms/monitoring-vue'")
    expect(manualSnippet).toContain("name: '手动 Trace 测试'")
    expect(manualSnippet).toContain("op: 'business', parent")
    expect(manualSnippet).toContain('await flush()')
    expect(wrapper.get('[data-testid="manual-trace-setup"]').text()).toContain('全部 spans')
    await wrapper.get('[data-testid="copy-manual-trace"]').trigger('click')
    expect(writeText).toHaveBeenLastCalledWith(manualSnippet)
    expect(wrapper.text()).not.toContain("captureException(new Error('PMS SDK test error'))")
    wrapper.unmount()
  })
  it('enables tracing explicitly for an existing scoped project', async () => {
    getProject.mockResolvedValue({ ...project })
    updateProjectTracing.mockResolvedValue({ ...project, tracingEnabled: true })
    const view = mount(ProjectDetailView)
    await flushPromises()
    await view
      .findAll('button')
      .find((b) => b.text() === '开启 Tracing')!
      .trigger('click')
    await flushPromises()
    expect(updateProjectTracing).toHaveBeenCalledWith('acme', 'frontend', true)
    expect(view.text()).toContain('关闭 Tracing')
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
    expect(wrapper.text()).toContain('初始化时会发送连接报告')
    expect(wrapper.text()).toContain('Vue、window.error 和 unhandledrejection')
    expect(wrapper.text()).toContain('手动验证或手动上报')
    expect(wrapper.text()).not.toContain('release:')
    expect(wrapper.text()).not.toContain('VITE_RELEASE')
    expect(wrapper.text()).not.toContain('返回组详情')
    expect(wrapper.text()).not.toContain('进入项目详情')
    expect(wrapper.text()).not.toContain('/api/sdk/check')
    expect(wrapper.text()).not.toContain('fetch(')
    await wrapper.get('[data-testid="copy-dsn"]').trigger('click')
    expect(writeText).toHaveBeenCalledWith(project.dsn)

    await wrapper.get('[data-testid="refresh-connection"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('已连接')
  })

  it('copies direct init without binding and defaults to any origin', async () => {
    getProject.mockResolvedValue({ ...project })
    const wrapper = mount(ProjectSetupView)
    await flushPromises()
    const snippet = wrapper.get('[data-testid="init-snippet"]').text()
    expect(snippet).toContain('initPmsMonitoring({')
    expect(snippet).not.toContain('bindingCode')
    expect(wrapper.text()).not.toContain('授权码')
    expect(wrapper.text()).not.toContain('bindProject')
    expect(wrapper.get('[data-testid="allowed-origins"]').text()).toContain('允许任意来源')
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
    expect(wrapper.get('[data-testid="allowed-origins"]').text()).toContain('允许任意来源')
    updateProjectOrigins.mockResolvedValueOnce({ ...project, allowedOrigins: [] })
    await wrapper.get('[data-testid="origins-input"]').setValue('')
    await wrapper.get('[data-testid="save-origins"]').trigger('click')
    await flushPromises()
    expect(updateProjectOrigins).toHaveBeenLastCalledWith('acme', 'frontend', [])
    expect(wrapper.get('[data-testid="allowed-origins"]').text()).toContain('不允许浏览器来源')
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
      expect(wrapper.text()).toContain('每行请输入精确的 http(s) Origin')
    }
    await wrapper
      .get('[data-testid="origins-input"]')
      .setValue(Array.from({ length: 21 }, (_, i) => `https://app${i}.example.com`).join('\n'))
    await wrapper.get('[data-testid="save-origins"]').trigger('click')
    expect(wrapper.text()).toContain('最多允许 20 个来源')
    expect(updateProjectOrigins).not.toHaveBeenCalled()
    updateProjectOrigins.mockRejectedValueOnce(new Error('failed'))
    await wrapper.get('[data-testid="origins-input"]').setValue('https://app.example.com')
    await wrapper.get('[data-testid="save-origins"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('保存来源设置失败')
    expect(wrapper.get('[data-testid="allowed-origins"]').text()).toContain('允许任意来源')
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
    expect(wrapper.text()).toContain('等待连接')
    expect(wrapper.text()).not.toContain('Replay')
    expect(wrapper.text()).not.toContain('查看错误')
    expect(wrapper.text()).not.toContain('查看 SDK 接入指引')
    expect(wrapper.findComponent({ name: 'RouterLink' }).exists()).toBe(false)
  })
})

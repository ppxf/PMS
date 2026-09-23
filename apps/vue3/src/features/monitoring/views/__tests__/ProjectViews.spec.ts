import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const { createProject, getProject, getProjectConnection, push, writeText } = vi.hoisted(() => ({
  createProject: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  getProject: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  getProjectConnection: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  push: vi.fn<(...args: unknown[]) => unknown>(),
  writeText: vi.fn<(value: string) => Promise<void>>(() => Promise.resolve()),
}))

vi.mock('../../api/monitoring.api', () => ({ createProject, getProject, getProjectConnection }))
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => ({ params: { groupSlug: 'acme', projectSlug: 'frontend' } }),
  useRouter: () => ({ push }),
}))

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

describe('project views', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    expect(wrapper.text()).toContain('pnpm add ./vendor/pms-monitoring-vue-0.1.0.tgz')
    expect(wrapper.text()).toContain('VITE_PMS_DSN=')
    expect(wrapper.text()).toContain("from '@pms/monitoring-vue'")
    expect(wrapper.text()).toContain('initPmsMonitoring')
    expect(wrapper.text()).not.toContain('/api/sdk/check')
    expect(wrapper.text()).not.toContain('fetch(')
    await wrapper.get('[data-testid="copy-dsn"]').trigger('click')
    expect(writeText).toHaveBeenCalledWith(project.dsn)

    await wrapper.get('[data-testid="refresh-connection"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('已连接')
  })

  it('shows project configuration without monitoring event data', async () => {
    getProject.mockResolvedValue({ ...project })
    const wrapper = mount(ProjectDetailView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Frontend')
    expect(wrapper.text()).toContain('Error Monitoring')
    expect(wrapper.text()).toContain('等待连接')
    expect(wrapper.text()).not.toContain('Replay')
  })
})

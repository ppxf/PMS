import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'

const {
  getProjectIssue,
  listProjectIssues,
  updateProjectIssueStatus,
  archiveProjectIssue,
  restoreProjectIssue,
  deleteProjectIssue,
  permanentlyDeleteProjectIssue,
  routerPush,
} = vi.hoisted(() => ({
  getProjectIssue: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  listProjectIssues: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  updateProjectIssueStatus: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  archiveProjectIssue: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  restoreProjectIssue: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  deleteProjectIssue: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  permanentlyDeleteProjectIssue: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  routerPush: vi.fn<(...args: unknown[]) => Promise<void>>(),
}))

vi.mock('../../api/monitoring.api', () => ({
  getProjectIssue,
  listProjectIssues,
  updateProjectIssueStatus,
  archiveProjectIssue,
  restoreProjectIssue,
  deleteProjectIssue,
  permanentlyDeleteProjectIssue,
}))
vi.mock('@/components/ui/dialog', async () => {
  const { defineComponent: define } = await import('vue')
  const Stub = define({ template: '<div><slot /></div>' })
  return {
    Dialog: Stub,
    DialogContent: Stub,
    DialogDescription: Stub,
    DialogFooter: Stub,
    DialogHeader: Stub,
    DialogTitle: Stub,
  }
})
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => ({
    params: {
      groupSlug: 'team',
      projectSlug: 'web',
      issueId: '00000000-0000-4000-8000-000000000001',
    },
  }),
  useRouter: () => ({ push: routerPush }),
}))

import ProjectIssueDetailView from '../ProjectIssueDetailView.vue'
import ProjectIssuesView from '../ProjectIssuesView.vue'

const RouterLinkStub = defineComponent({
  name: 'RouterLink',
  props: { to: { type: Object, required: true } },
  template: '<a><slot /></a>',
})

const event = {
  id: 'event-1',
  timestamp: '2026-09-23T02:59:58.000Z',
  receivedAt: '2026-09-23T03:00:00.000Z',
  source: 'vue' as const,
  level: 'error' as const,
  message: 'Render failed',
  exceptionType: 'TypeError',
  exceptionValue: 'Cannot render',
  stacktrace: 'TypeError: Cannot render\n    at render (App.vue:12:3)',
  url: 'https://example.com/dashboard',
  environment: 'production',
  tags: { component: 'App', browser: 'Chrome' },
  contexts: {
    request: {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/152.0.0.0' },
      cookies: { theme: 'dark', session_id: '[Filtered]' },
    },
    browser: { name: 'Chrome', version: '152.0.0.0', userAgent: 'Mozilla/5.0 Chrome/152.0.0.0' },
    os: { name: 'Windows' },
    device: { platform: 'Win32', screenWidth: 1920, screenHeight: 1080, viewportWidth: 1280, viewportHeight: 720, pixelRatio: 1.5 },
    culture: { locale: 'zh-CN', languages: ['zh-CN', 'en-US'], timezone: 'Asia/Shanghai' },
    memory: { usedJSHeapSize: 1_048_576, totalJSHeapSize: 2_097_152, jsHeapSizeLimit: 4_194_304, deviceMemoryGiB: 16 },
  },
}

const issue = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Render failed',
  exceptionType: 'TypeError',
  culprit: 'at render',
  status: 'unresolved' as const,
  eventCount: 2,
  firstSeenAt: '2026-09-23T02:00:00.000Z',
  lastSeenAt: '2026-09-23T03:00:00.000Z',
  source: 'vue' as const,
  visibility: 'active' as const,
  archiveThreshold: null,
  archivedAt: null,
  environment: 'production',
  resolvedAt: null,
  resolutionReason: null,
  reopenedAt: null,
  reopenCount: 0,
}

describe('project issue views', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders issue summaries and preserves route scope in detail links', async () => {
    listProjectIssues.mockResolvedValue({ items: [issue], total: 21, page: 1, pageSize: 20 })
    const wrapper = mount(ProjectIssuesView, {
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Render failed')
    expect(wrapper.text()).toContain('TypeError')
    expect(wrapper.text()).toContain('来源')
    expect(wrapper.text()).toContain('vue')
    expect(wrapper.text()).not.toContain('环境')
    expect(wrapper.text()).toContain('状态')
    expect(wrapper.text()).toContain('未解决')
    expect(wrapper.text()).toContain('2 次')
    expect(wrapper.text()).not.toContain('production')
    expect(wrapper.text()).not.toContain('版本')
    expect(wrapper.text()).toContain('首次出现')
    expect(wrapper.text()).toContain('最近出现')
    const link = wrapper.findComponent({ name: 'RouterLink' })
    expect(link.props('to')).toEqual({
      name: 'project-issue-detail',
      params: { groupSlug: 'team', projectSlug: 'web', issueId: issue.id },
    })

    await wrapper.get('button[aria-label="下一页"]').trigger('click')
    await flushPromises()
    expect(listProjectIssues).toHaveBeenLastCalledWith('team', 'web', { page: 2, pageSize: 20 })
  })

  it('shows an error and retries the issue list request', async () => {
    listProjectIssues.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
      items: [], total: 0, page: 1, pageSize: 20,
    })
    const wrapper = mount(ProjectIssuesView)
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('无法加载错误列表')
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(listProjectIssues).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('暂无错误')
  })

  it('switches to archived issues and distinguishes archive modes', async () => {
    const countArchived = {
      ...issue,
      visibility: 'archived_until_count' as const,
      archiveThreshold: 100 as const,
      archivedAt: '2026-09-30T01:00:00.000Z',
    }
    const permanentArchived = {
      ...issue,
      id: '00000000-0000-4000-8000-000000000002',
      visibility: 'archived_permanent' as const,
      archivedAt: '2026-09-30T02:00:00.000Z',
    }
    listProjectIssues
      .mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 20 })
      .mockResolvedValueOnce({
        items: [countArchived, permanentArchived], total: 2, page: 1, pageSize: 20,
      })
    const wrapper = mount(ProjectIssuesView, {
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    await flushPromises()

    await wrapper.get('[data-testid="show-archived"]').trigger('click')
    await flushPromises()

    expect(listProjectIssues).toHaveBeenLastCalledWith('team', 'web', {
      page: 1, pageSize: 20, view: 'archived',
    })
    expect(wrapper.text()).toContain('达到 100 次后恢复')
    expect(wrapper.text()).toContain('永久归档')
    expect(wrapper.find('tbody tr.bg-amber-50\\/60').exists()).toBe(true)
    expect(wrapper.find('tbody tr.bg-slate-50\\/80').exists()).toBe(true)
  })

  it('debounces server-side search and resets pagination', async () => {
    listProjectIssues.mockResolvedValue({ items: [issue], total: 21, page: 1, pageSize: 20 })
    const wrapper = mount(ProjectIssuesView, {
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    await flushPromises()
    await wrapper.get('button[aria-label="下一页"]').trigger('click')
    await flushPromises()

    await wrapper.get('input[aria-label="搜索错误列表"]').setValue('vue')
    await new Promise((resolve) => setTimeout(resolve, 350))
    await flushPromises()

    expect(listProjectIssues).toHaveBeenLastCalledWith('team', 'web', {
      page: 1,
      pageSize: 20,
      search: 'vue',
    })
  })

  it('renders resolved summaries and automatic resolution details', async () => {
    const resolvedIssue = {
      ...issue,
      status: 'resolved' as const,
      resolvedAt: '2026-09-29T03:00:00.000Z',
      resolutionReason: 'auto_inactivity' as const,
    }
    listProjectIssues.mockResolvedValue({
      items: [resolvedIssue], total: 1, page: 1, pageSize: 20,
    })
    const list = mount(ProjectIssuesView, {
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    await flushPromises()
    expect(list.text()).toContain('已解决')

    getProjectIssue.mockResolvedValue({
      ...resolvedIssue, latestEvent: event, recentEvents: [event],
    })
    const detail = mount(ProjectIssueDetailView)
    await flushPromises()
    expect(detail.get('[data-testid="issue-status"]').text()).toBe('已解决')
    expect(detail.get('[data-testid="issue-status"]').attributes('data-variant')).toBe('success')
    expect(detail.get('[data-testid="issue-count"]').attributes('data-variant')).toBe('success')
    expect(detail.get('[data-testid="resolution-summary"]').text()).toContain(
      '连续 7 天未再次出现，已自动解决',
    )
    expect(detail.get('[data-testid="resolution-summary"]').text()).toContain(
      new Date(resolvedIssue.resolvedAt).toLocaleString(),
    )
  })

  it('allows manual resolution and reopening from the detail page', async () => {
    getProjectIssue.mockResolvedValue({ ...issue, latestEvent: event, recentEvents: [event] })
    updateProjectIssueStatus.mockResolvedValue({
      ...issue,
      status: 'resolved',
      resolvedAt: '2026-09-29T04:00:00.000Z',
      resolutionReason: 'manual',
      latestEvent: event,
      recentEvents: [event],
    })
    const wrapper = mount(ProjectIssueDetailView, {
      global: { stubs: { teleport: true } },
    })
    await flushPromises()

    await wrapper.get('[data-testid="issue-status-action"]').trigger('click')
    await flushPromises()
    expect(updateProjectIssueStatus).toHaveBeenCalledWith(
      'team', 'web', issue.id, 'resolved',
    )
    expect(wrapper.get('[data-testid="issue-status"]').text()).toBe('已解决')
    expect(wrapper.text()).toContain('手动标记为已解决')

    updateProjectIssueStatus.mockResolvedValue({
      ...issue,
      reopenedAt: '2026-09-29T05:00:00.000Z',
      reopenCount: 1,
      latestEvent: event,
      recentEvents: [event],
    })
    await wrapper.get('[data-testid="issue-status-action"]').trigger('click')
    await flushPromises()
    expect(updateProjectIssueStatus).toHaveBeenLastCalledWith(
      'team', 'web', issue.id, 'unresolved',
    )
    expect(wrapper.text()).toContain('重新打开 1 次')
  })

  it('archives by cumulative count and restores an archived issue', async () => {
    const tenCountIssue = { ...issue, eventCount: 10 }
    getProjectIssue.mockResolvedValue({ ...tenCountIssue, latestEvent: event, recentEvents: [event] })
    archiveProjectIssue.mockResolvedValue({
      ...tenCountIssue,
      visibility: 'archived_until_count',
      archiveThreshold: 100,
      archivedAt: '2026-09-30T10:00:00.000Z',
      latestEvent: event,
      recentEvents: [event],
    })
    const wrapper = mount(ProjectIssueDetailView, {
      global: { stubs: { teleport: true } },
    })
    await flushPromises()

    await wrapper.get('[data-testid="archive-issue"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="archive-threshold-10"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="archive-mode-until-count"]').setValue()
    await wrapper.get('[data-testid="archive-threshold-100"]').setValue()
    await wrapper.get('[data-testid="confirm-archive"]').trigger('click')
    await flushPromises()
    expect(archiveProjectIssue).toHaveBeenCalledWith('team', 'web', issue.id, {
      mode: 'until_count', threshold: 100,
    })
    expect(wrapper.text()).toContain('达到 100 次后恢复')

    restoreProjectIssue.mockResolvedValue({
      ...tenCountIssue, latestEvent: event, recentEvents: [event],
    })
    await wrapper.get('[data-testid="restore-issue"]').trigger('click')
    await flushPromises()
    expect(restoreProjectIssue).toHaveBeenCalledWith('team', 'web', issue.id)
  })

  it('requires a second dialog before permanently deleting an issue', async () => {
    getProjectIssue.mockResolvedValue({ ...issue, latestEvent: event, recentEvents: [event] })
    permanentlyDeleteProjectIssue.mockResolvedValue(undefined)
    const wrapper = mount(ProjectIssueDetailView, {
      global: { stubs: { teleport: true } },
    })
    await flushPromises()

    await wrapper.get('[data-testid="delete-issue"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="choose-permanent-delete"]').trigger('click')
    await flushPromises()
    expect(permanentlyDeleteProjectIssue).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="confirm-permanent-delete"]').trigger('click')
    await flushPromises()

    expect(permanentlyDeleteProjectIssue).toHaveBeenCalledWith('team', 'web', issue.id)
    expect(routerPush).toHaveBeenCalledWith({ name: 'project-issues' })
  })

  it('deletes the current issue after one confirmation', async () => {
    getProjectIssue.mockResolvedValue({ ...issue, latestEvent: event, recentEvents: [event] })
    deleteProjectIssue.mockResolvedValue(undefined)
    const wrapper = mount(ProjectIssueDetailView, {
      global: { stubs: { teleport: true } },
    })
    await flushPromises()

    await wrapper.get('[data-testid="delete-issue"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="confirm-delete-once"]').trigger('click')
    await flushPromises()

    expect(deleteProjectIssue).toHaveBeenCalledWith('team', 'web', issue.id)
    expect(permanentlyDeleteProjectIssue).not.toHaveBeenCalled()
    expect(routerPush).toHaveBeenCalledWith({ name: 'project-issues' })
  })

  it('renders issue detail metadata, tags, stacktrace and recent events', async () => {
    getProjectIssue.mockResolvedValue({ ...issue, latestEvent: event, recentEvents: [event] })
    const wrapper = mount(ProjectIssueDetailView)
    await flushPromises()

    expect(wrapper.text()).toContain('Render failed')
    expect(wrapper.text()).toContain('2 次')
    expect(wrapper.get('[data-testid="issue-status"]').text()).toBe('未解决')
    expect(wrapper.get('[data-testid="first-seen-at"]').text()).toBe(
      new Date(issue.firstSeenAt).toLocaleString(),
    )
    expect(wrapper.get('[data-testid="last-seen-at"]').text()).toBe(
      new Date(issue.lastSeenAt).toLocaleString(),
    )
    expect(wrapper.text()).toContain('https://example.com/dashboard')
    expect(wrapper.text()).toContain('vue')
    expect(wrapper.text()).toContain('production')
    expect(wrapper.text()).toContain('请求信息')
    expect(wrapper.text()).toContain('User-Agent')
    expect(wrapper.text()).toContain('session_id')
    expect(wrapper.text()).toContain('[Filtered]')
    expect(wrapper.text()).toContain('浏览器上下文')
    expect(wrapper.text()).toContain('Chrome 152.0.0.0')
    expect(wrapper.text()).toContain('Asia/Shanghai')
    expect(wrapper.text()).toContain('zh-CN, en-US')
    expect(wrapper.text()).toContain('1.0 MiB')
    expect(wrapper.text()).not.toContain('Runtime')
    expect(wrapper.text()).toContain('component')
    expect(wrapper.text()).toContain('App')
    const stack = wrapper.get('pre')
    expect(stack.classes()).toContain('whitespace-pre-wrap')
    expect(stack.text()).toBe(event.stacktrace)
    expect(wrapper.text()).toContain('最近事件')
    expect(wrapper.text()).toContain('Chrome')
  })

  it('shows five request headers and cookies by default and expands them independently', async () => {
    const headers = Object.fromEntries(
      Array.from({ length: 7 }, (_, index) => [`Header-${index + 1}`, `value-${index + 1}`]),
    )
    const cookies = Object.fromEntries(
      Array.from({ length: 7 }, (_, index) => [`cookie-${index + 1}`, `value-${index + 1}`]),
    )
    getProjectIssue.mockResolvedValue({
      ...issue,
      latestEvent: {
        ...event,
        contexts: { ...event.contexts, request: { headers, cookies } },
      },
      recentEvents: [],
    })
    const wrapper = mount(ProjectIssueDetailView)
    await flushPromises()

    expect(wrapper.findAll('[data-testid="request-header-row"]')).toHaveLength(5)
    expect(wrapper.findAll('[data-testid="request-cookie-row"]')).toHaveLength(5)

    const headersToggle = wrapper.get('[data-testid="request-headers-toggle"]')
    expect(headersToggle.text()).toContain('展开全部（7）')
    await headersToggle.trigger('click')
    expect(wrapper.findAll('[data-testid="request-header-row"]')).toHaveLength(7)
    expect(wrapper.findAll('[data-testid="request-cookie-row"]')).toHaveLength(5)
    expect(headersToggle.text()).toBe('收起')

    await headersToggle.trigger('click')
    expect(wrapper.findAll('[data-testid="request-header-row"]')).toHaveLength(5)

    const cookiesToggle = wrapper.get('[data-testid="request-cookies-toggle"]')
    expect(cookiesToggle.text()).toContain('展开全部（7）')
    await cookiesToggle.trigger('click')
    expect(wrapper.findAll('[data-testid="request-cookie-row"]')).toHaveLength(7)
    expect(wrapper.findAll('[data-testid="request-header-row"]')).toHaveLength(5)
    expect(cookiesToggle.text()).toBe('收起')
  })

  it('safely renders missing event metadata', async () => {
    getProjectIssue.mockResolvedValue({
      ...issue,
      environment: null,
      latestEvent: { ...event, stacktrace: null, url: null, environment: null, tags: {}, contexts: {} },
      recentEvents: [],
    })
    const wrapper = mount(ProjectIssueDetailView)
    await flushPromises()

    expect(wrapper.text()).toContain('无堆栈')
    expect(wrapper.text()).toContain('-')
  })

  it('renders an explicit empty state when the latest event is absent', async () => {
    getProjectIssue.mockResolvedValue({ ...issue, latestEvent: null, recentEvents: [] })
    const wrapper = mount(ProjectIssueDetailView)
    await flushPromises()

    expect(wrapper.text()).toContain('暂无最新事件')
    expect(wrapper.find('pre').exists()).toBe(false)
    expect(wrapper.text()).toContain('暂无最近事件')
  })
})

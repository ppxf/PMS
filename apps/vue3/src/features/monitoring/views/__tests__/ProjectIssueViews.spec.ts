import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'

const { getProjectIssue, listProjectIssues } = vi.hoisted(() => ({
  getProjectIssue: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  listProjectIssues: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))

vi.mock('../../api/monitoring.api', () => ({ getProjectIssue, listProjectIssues }))
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => ({
    params: {
      groupSlug: 'team',
      projectSlug: 'web',
      issueId: '00000000-0000-4000-8000-000000000001',
    },
  }),
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
  environment: 'production',
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
    expect(wrapper.text()).toContain('状态')
    expect(wrapper.text()).toContain('未解决')
    expect(wrapper.text()).toContain('2 次')
    expect(wrapper.text()).toContain('production')
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

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import ProjectDetailView from '@/features/monitoring/views/ProjectDetailView.vue'
import FormSelect from '@/components/ui/select/FormSelect.vue'
import { selectValue } from '@/test/select'
import { Toaster, toast } from '@/components/ui/toast'
import { setLocale } from '..'

const { getProject } = vi.hoisted(() => ({ getProject: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { groupSlug: 'team', projectSlug: 'web' } }),
}))
vi.mock('@/features/monitoring/api/monitoring.api', () => ({
  getProject,
  updateProjectOrigins: vi.fn(),
  updateProjectTracing: vi.fn(),
  updateProjectMetrics: vi.fn(),
  updateProjectLogging: vi.fn(),
  updateProjectErrorMonitoring: vi.fn(),
}))
const Page = defineComponent({
  components: { LanguageSwitcher, ProjectDetailView, Toaster },
  template: '<LanguageSwitcher /><ProjectDetailView /><Toaster />',
})

beforeEach(() => {
  setLocale('en')
  getProject.mockResolvedValue({
    name: 'Dashboard',
    allowedOrigins: ['*'],
    errorMonitoringEnabled: true,
    loggingEnabled: false,
    tracingEnabled: false,
    metricsEnabled: false,
    profilesEnabled: false,
  })
})
afterEach(() => {
  setLocale('en')
  localStorage.removeItem('pms.locale')
})

it('switches the live settings and toast without changing user data or a draft', async () => {
  const page = mount(Page)
  try {
    await flushPromises()
    const origins = page.get('[data-testid="origins-input"]')
    await origins.setValue('https://draft.example.com')
    toast.success('Copied DSN', undefined, 2000)
    await nextTick()
    expect(page.text()).toContain('Feature settings')
    expect(page.get('[data-toast]').text()).toContain('Copied DSN')

    await selectValue(page, 'Language', 'zh-CN')
    await nextTick()
    expect(page.text()).toContain('功能开关')
    expect(page.text()).toContain('SDK 上报来源')
    expect(page.get('[role="switch"][aria-label="异常监控"]').attributes('aria-checked')).toBe(
      'true',
    )
    expect(page.get('[data-toast]').text()).toContain('已复制DSN')
    expect(page.get('h2').text()).toBe('Dashboard')
    expect((origins.element as HTMLTextAreaElement).value).toBe('https://draft.example.com')

    await selectValue(page, '语言', 'en')
    await nextTick()
    expect(page.text()).toContain('Feature settings')
    expect(page.get('[data-toast]').text()).toContain('Copied DSN')
    expect((origins.element as HTMLTextAreaElement).value).toBe('https://draft.example.com')
    await page.get('button[aria-label="Dismiss notification"]').trigger('click')
  } finally {
    page.unmount()
  }
})

it('updates a closed select label immediately while preserving its protocol value', async () => {
  const select = mount(FormSelect, {
    props: { modelValue: 'logs', options: [{ value: 'logs', label: 'Logs' }] },
  })
  try {
    expect(select.get('[role="combobox"]').text()).toBe('Logs')
    setLocale('zh-CN')
    await nextTick()
    expect(select.get('[role="combobox"]').text()).toBe('日志')
    expect(select.props('modelValue')).toBe('logs')
    expect(select.emitted('update:modelValue')).toBeUndefined()
  } finally {
    select.unmount()
  }
})

it('keeps an unmatched empty field selection visible as a translated placeholder', async () => {
  const select = mount(FormSelect, {
    props: {
      modelValue: '',
      options: [{ value: 'span.name', label: 'span.name' }],
      placeholder: 'Select a field',
    },
  })
  try {
    expect(select.get('[role="combobox"]').text()).toBe('Select a field')
    setLocale('zh-CN')
    await nextTick()
    expect(select.get('[role="combobox"]').text()).toBe('选择字段')
  } finally {
    select.unmount()
  }
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const { createGroup, getGroup, listGroups, listProjects, push } = vi.hoisted(() => ({
  createGroup: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  getGroup: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  listGroups: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  listProjects: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  push: vi.fn<(...args: unknown[]) => unknown>(),
}))

vi.mock('../../api/monitoring.api', () => ({ createGroup, getGroup, listGroups, listProjects }))
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => ({ params: { groupSlug: 'acme' } }),
  useRouter: () => ({ push }),
}))

import CreateGroupView from '../CreateGroupView.vue'
import GroupDetailView from '../GroupDetailView.vue'
import GroupsView from '../GroupsView.vue'

const group = {
  id: 'group-1',
  name: 'Acme',
  slug: 'acme',
  projectCount: 1,
  createdAt: '2026-09-22T00:00:00Z',
  updatedAt: '2026-09-22T00:00:00Z',
}

describe('group views', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('creates a group and continues to project creation', async () => {
    createGroup.mockResolvedValue(group)
    const wrapper = mount(CreateGroupView)

    await wrapper.get('input[name="name"]').setValue('Acme')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(createGroup).toHaveBeenCalledWith({ name: 'Acme' })
    expect(push).toHaveBeenCalledWith({
      name: 'create-project',
      params: { groupSlug: 'acme' },
    })
  })

  it('shows the group list and empty state', async () => {
    listGroups.mockResolvedValueOnce([group])
    const populated = mount(GroupsView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    expect(populated.text()).toContain('Acme')
    expect(populated.text()).toContain('1 个项目')

    listGroups.mockResolvedValueOnce([])
    const empty = mount(GroupsView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    expect(empty.text()).toContain('还没有组')
  })

  it('shows group projects and a create project action', async () => {
    getGroup.mockResolvedValue(group)
    listProjects.mockResolvedValue([
      { id: 'project-1', name: 'Frontend', slug: 'frontend', connected: false },
    ])
    const wrapper = mount(GroupDetailView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Acme')
    expect(wrapper.text()).toContain('Frontend')
    expect(wrapper.text()).toContain('创建项目')
  })
})

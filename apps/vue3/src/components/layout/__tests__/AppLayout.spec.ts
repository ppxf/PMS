import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import AppLayout from '../AppLayout.vue'

const EmptyView = defineComponent({ template: '<div />' })

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/groups/:groupSlug/projects/:projectSlug/logs',
        name: 'project-logs',
        component: EmptyView,
      },
      { path: '/', name: 'dashboard', component: EmptyView },
      { path: '/groups', name: 'groups', component: EmptyView },
      {
        path: '/groups/:groupSlug/projects/:projectSlug/config',
        name: 'project-detail',
        component: EmptyView,
      },
      {
        path: '/groups/:groupSlug/projects/:projectSlug/setup',
        name: 'project-setup',
        component: EmptyView,
      },
      {
        path: '/groups/:groupSlug/projects/:projectSlug/issues',
        name: 'project-issues',
        component: EmptyView,
      },
      {
        path: '/groups/:groupSlug/projects/:projectSlug/issues/:issueId',
        name: 'project-issue-detail',
        component: EmptyView,
      },
      {
        path: '/groups/:groupSlug/projects/:projectSlug/setup/traces',
        name: 'project-traces-setup',
        component: EmptyView,
      },
      {
        path: '/groups/:groupSlug/projects/:projectSlug/setup/metrics',
        name: 'project-metrics-setup',
        component: EmptyView,
      },
      { path: '/users', name: 'users', component: EmptyView },
      {
        path: '/groups/:groupSlug/projects/:projectSlug/traces',
        name: 'project-traces',
        component: EmptyView,
      },
      { path: '/login', name: 'login', component: EmptyView },
      {
        path: '/groups/:groupSlug/projects/:projectSlug/metrics',
        name: 'project-metrics',
        component: EmptyView,
      },
    ],
  })
}

async function mountAt(path: string) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createTestRouter()
  await router.push(path)
  await router.isReady()

  const wrapper = mount(AppLayout, {
    global: { plugins: [pinia, router] },
  })
  await flushPromises()

  return wrapper
}

describe('AppLayout navigation', () => {
  it('links and highlights Metrics setup for the current project', async () => {
    const wrapper = await mountAt('/groups/acme/projects/frontend/setup/metrics')
    const link = wrapper.get('a[href="/groups/acme/projects/frontend/setup/metrics"]')
    expect(link.text()).toBe('Metrics setup')
    expect(link.classes()).toContain('bg-muted')
    expect(wrapper.get('a[href="/groups/acme/projects/frontend/setup"]').classes()).not.toContain(
      'bg-muted',
    )
    wrapper.unmount()
  })
  it('highlights Metrics for the current project', async () => {
    const wrapper = await mountAt('/groups/acme/projects/frontend/metrics')
    const link = wrapper.get('a[href="/groups/acme/projects/frontend/metrics"]')
    expect(link.text()).toContain('Metrics')
    expect(link.classes()).toContain('bg-muted')
  })
  it('shows SDK child menus and highlights Traces setup within the current project', async () => {
    const wrapper = await mountAt('/groups/acme/projects/frontend/setup/traces')
    expect(wrapper.get('a[href="/groups/acme/projects/frontend/setup"]').text()).toContain(
      'Basic setup',
    )
    const traces = wrapper.get('a[href="/groups/acme/projects/frontend/setup/traces"]')
    expect(traces.text()).toContain('Traces setup')
    expect(traces.classes()).toContain('bg-muted')
  })
  beforeEach(() => localStorage.clear())

  it('shows Dashboard without highlighting it on a project page', async () => {
    const wrapper = await mountAt('/groups/acme/projects/frontend/config')
    const homeLink = wrapper.get('a[href="/"]')

    expect(homeLink.text()).toContain('Dashboard')
    expect(homeLink.classes()).not.toContain('bg-muted')
  })

  it('shows current-project navigation including Traces', async () => {
    const wrapper = await mountAt('/groups/acme/projects/frontend/config')

    const currentProjectItem = wrapper.get('[data-testid="current-project-navigation"]')
    expect(currentProjectItem.text()).toContain('Current project')
    expect(currentProjectItem.element.tagName).not.toBe('A')
    expect(currentProjectItem.classes()).toEqual(
      expect.arrayContaining(['flex', 'items-center', 'gap-3', 'rounded-md', 'px-3', 'py-2']),
    )
    expect(wrapper.get('a[href="/groups/acme/projects/frontend/setup"]').text()).toContain(
      'Basic setup',
    )
    expect(wrapper.get('a[href="/groups/acme/projects/frontend/issues"]').text()).toContain(
      'Errors',
    )
    const configurationLink = wrapper.get('a[href="/groups/acme/projects/frontend/config"]')
    expect(configurationLink.text()).toContain('Settings')
    expect(configurationLink.classes()).toContain('bg-muted')
    expect(wrapper.get('a[href="/groups/acme/projects/frontend/traces"]').text()).toContain(
      'Traces',
    )
  })

  it('keeps the single error-list action highlighted on an error detail page', async () => {
    const wrapper = await mountAt('/groups/acme/projects/frontend/issues/issue-1')
    const errorLinks = wrapper.findAll('a').filter((link) => link.text().includes('Errors'))

    expect(errorLinks).toHaveLength(1)
    expect(errorLinks[0]?.classes()).toContain('bg-muted')
  })
})

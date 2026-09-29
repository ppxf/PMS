import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import { routes } from '../routes'
import type { RouteRecordRaw } from 'vue-router'

const EmptyView = defineComponent({ template: '<div />' })

function withoutLazyComponents(route: RouteRecordRaw): RouteRecordRaw {
  return {
    ...route,
    component: route.component ? EmptyView : undefined,
    children: route.children?.map(withoutLazyComponents),
  } as RouteRecordRaw
}

describe('project routes', () => {
  it('opens SDK setup by default when entering a project', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: routes.map(withoutLazyComponents),
    })

    await router.push('/groups/acme/projects/frontend')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('project-setup')
    expect(router.currentRoute.value.fullPath).toBe('/groups/acme/projects/frontend/setup')
  })
})

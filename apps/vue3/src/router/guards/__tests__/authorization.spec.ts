import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import { useAuthStore } from '@/features/auth'
import { installAuthorizationGuards } from '../authorization'

import type { Pinia } from 'pinia'
import type { Router } from 'vue-router'

const { getCurrentUser } = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<unknown>>(),
}))
const { listGroups } = vi.hoisted(() => ({
  listGroups: vi.fn<() => Promise<unknown>>(),
}))
vi.mock('@/features/auth/api/auth.api', () => ({ getCurrentUser }))
vi.mock('@/features/monitoring/api/monitoring.api', () => ({ listGroups }))

function createTestRouter(pinia: Pinia): Router {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/login',
        name: 'login',
        component: { template: '<div />' },
        meta: { title: '登录' },
      },
      {
        path: '/forbidden',
        name: 'forbidden',
        component: { template: '<div />' },
        meta: { title: '无权访问', requiresAuth: true },
      },
      {
        path: '/onboarding/groups/new',
        name: 'create-group-onboarding',
        component: { template: '<div />' },
        meta: { title: '创建组', requiresAuth: true },
      },
      {
        path: '/protected',
        name: 'protected',
        component: { template: '<div />' },
        meta: {
          title: '受保护页面',
          requiresAuth: true,
          permissions: ['report:read'],
        },
      },
    ],
  })

  installAuthorizationGuards(router, pinia)
  return router
}

describe('authorization guard', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    listGroups.mockResolvedValue([{ id: 'group-1', slug: 'acme' }])
  })

  it('restores the server session before checking permissions', async () => {
    localStorage.setItem(
      'pms.auth.session',
      JSON.stringify({
        accessToken: 'stored-token',
        user: { id: '1', name: '旧资料', email: 'admin@example.com' },
        permissions: [],
      }),
    )
    getCurrentUser.mockResolvedValue({
      user: { id: '1', name: '管理员', email: 'admin@example.com' },
      permissions: ['report:read'],
    })
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createTestRouter(pinia)

    await router.push('/protected')

    expect(getCurrentUser).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.name).toBe('protected')
  })

  it('redirects anonymous users to login', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createTestRouter(pinia)

    await router.push('/protected')

    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/protected')
  })

  it('redirects authenticated users without permission', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.login({
      accessToken: 'token',
      user: { id: '1', name: '访客', email: 'viewer@example.com' },
      permissions: [],
    })
    const router = createTestRouter(pinia)

    await router.push('/protected')

    expect(router.currentRoute.value.name).toBe('forbidden')
  })

  it('redirects authenticated users without groups to onboarding', async () => {
    listGroups.mockResolvedValue([])
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.login({
      accessToken: 'token',
      user: { id: '1', name: '新用户', email: 'new@example.com' },
      permissions: ['report:read'],
    })
    const router = createTestRouter(pinia)

    await router.push('/protected')

    expect(router.currentRoute.value.name).toBe('create-group-onboarding')
  })

  it('does not loop while already on the onboarding route', async () => {
    listGroups.mockResolvedValue([])
    const pinia = createPinia()
    setActivePinia(pinia)
    useAuthStore().login({
      accessToken: 'token',
      user: { id: '1', name: '新用户', email: 'new@example.com' },
      permissions: [],
    })
    const router = createTestRouter(pinia)

    await router.push('/onboarding/groups/new')

    expect(router.currentRoute.value.name).toBe('create-group-onboarding')
  })
})

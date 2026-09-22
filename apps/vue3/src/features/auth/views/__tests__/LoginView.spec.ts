import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '@/services/http'
import { useAuthStore } from '../../model/auth.store'
import LoginView from '../LoginView.vue'

const { login } = vi.hoisted(() => ({
  login: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))
vi.mock('@/features/auth/api/auth.api', () => ({
  getCurrentUser: vi.fn<() => Promise<unknown>>(),
  login,
}))

async function mountLogin(url = '/login?redirect=/users') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'login', component: LoginView },
      { path: '/register', component: { template: '<div />' } },
      { path: '/forgot-password', component: { template: '<div />' } },
      { path: '/', name: 'home', component: { template: '<div>home</div>' } },
      { path: '/users', name: 'users', component: { template: '<div>users</div>' } },
    ],
  })
  await router.push(url)
  await router.isReady()
  const wrapper = mount(LoginView, { global: { plugins: [pinia, router] } })
  return { wrapper, router, auth: useAuthStore(pinia) }
}

async function submitValidForm(wrapper: Awaited<ReturnType<typeof mountLogin>>['wrapper']) {
  await wrapper.get('input[name="email"]').setValue('admin@example.com')
  await wrapper.get('input[name="password"]').setValue('password123')
  await wrapper.get('form').trigger('submit')
  await vi.waitFor(() => expect(login).toHaveBeenCalledTimes(1))
  await flushPromises()
}

describe('LoginView', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('stores the server session and follows a safe redirect', async () => {
    login.mockResolvedValue({
      accessToken: 'server-token',
      user: { id: '1', name: '系统管理员', email: 'admin@example.com' },
      permissions: ['user:read'],
    })
    const { wrapper, router, auth } = await mountLogin()

    await submitValidForm(wrapper)

    expect(login).toHaveBeenCalledWith({
      email: 'admin@example.com',
      password: 'password123',
    })
    expect(auth.accessToken).toBe('server-token')
    expect(router.currentRoute.value.fullPath).toBe('/users')
  })

  it('shows the normalized API error without navigating', async () => {
    login.mockRejectedValue(new AppError('邮箱或密码错误', { status: 401 }))
    const { wrapper, router } = await mountLogin('/login')

    await submitValidForm(wrapper)

    expect(wrapper.get('[role="alert"]').text()).toContain('邮箱或密码错误')
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('rejects protocol-relative redirects', async () => {
    login.mockResolvedValue({
      accessToken: 'server-token',
      user: { id: '1', name: '管理员', email: 'admin@example.com' },
      permissions: [],
    })
    const { wrapper, router } = await mountLogin('/login?redirect=//evil.example')

    await submitValidForm(wrapper)

    expect(router.currentRoute.value.fullPath).toBe('/')
  })
})

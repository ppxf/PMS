import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ForgotPasswordView from '../ForgotPasswordView.vue'
import RegisterView from '../RegisterView.vue'
import ResetPasswordView from '../ResetPasswordView.vue'
import VerifyEmailView from '../VerifyEmailView.vue'

const api = vi.hoisted(() => ({
  forgotPassword: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  register: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  resetPassword: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  verifyEmail: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))
vi.mock('@/features/auth/api/auth.api', () => api)

async function mountAt(component: object, url: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', component: { template: '<div />' } },
      { path: '/test', component },
    ],
  })
  await router.push(url)
  await router.isReady()
  return mount(component, { global: { plugins: [router] } })
}

describe('account lifecycle views', () => {
  beforeEach(() => vi.clearAllMocks())

  it('registers a visitor and shows the mail prompt', async () => {
    api.register.mockResolvedValue({
      message: 'Registration successful. Check your inbox for a verification email',
    })
    const wrapper = await mountAt(RegisterView, '/test')
    const inputs = wrapper.findAll('input')
    await inputs[0]!.setValue('Test User')
    await inputs[1]!.setValue('user@example.com')
    await inputs[2]!.setValue('password123')
    await inputs[3]!.setValue('password123')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(api.register).toHaveBeenCalledTimes(1))
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain(
      'Check your inbox for a verification email',
    )
  })

  it('verifies the token from the query string', async () => {
    api.verifyEmail.mockResolvedValue({ message: 'Email verified successfully' })
    const wrapper = await mountAt(VerifyEmailView, '/test?token=verify-token')
    await vi.waitFor(() => expect(api.verifyEmail).toHaveBeenCalledWith('verify-token'))
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('verified successfully')
  })

  it('shows the non-enumerating forgot-password response', async () => {
    api.forgotPassword.mockResolvedValue({
      message: 'If this email is registered, we will send a reset email',
    })
    const wrapper = await mountAt(ForgotPasswordView, '/test')
    await wrapper.get('input').setValue('user@example.com')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(api.forgotPassword).toHaveBeenCalledWith('user@example.com'))
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('If this email is registered')
  })

  it('resets a password with the token from the query string', async () => {
    api.resetPassword.mockResolvedValue({ message: 'Password reset successfully' })
    const wrapper = await mountAt(ResetPasswordView, '/test?token=reset-token')
    const inputs = wrapper.findAll('input')
    await inputs[0]!.setValue('new-password')
    await inputs[1]!.setValue('new-password')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() =>
      expect(api.resetPassword).toHaveBeenCalledWith({
        token: 'reset-token',
        password: 'new-password',
        passwordConfirmation: 'new-password',
      }),
    )
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('reset successfully')
  })
})

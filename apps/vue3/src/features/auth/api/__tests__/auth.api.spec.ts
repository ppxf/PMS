import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, post } = vi.hoisted(() => ({
  get: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  post: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))

vi.mock('@/services/http', () => ({ http: { get, post } }))

import {
  forgotPassword,
  getCurrentUser,
  login,
  register,
  resendVerification,
  resetPassword,
  verifyEmail,
} from '../auth.api'

describe('auth API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('posts credentials to the login endpoint', async () => {
    const session = {
      accessToken: 'token',
      user: { id: '1', name: '管理员', email: 'admin@example.com' },
      permissions: ['user:read'],
    }
    post.mockResolvedValue(session)

    await expect(login({ email: 'admin@example.com', password: '123456' })).resolves.toBe(session)
    expect(post).toHaveBeenCalledWith('/auth/login', {
      email: 'admin@example.com',
      password: '123456',
    })
  })

  it('gets the current user from the session endpoint', async () => {
    const current = {
      user: { id: '1', name: '管理员', email: 'admin@example.com' },
      permissions: ['user:read'],
    }
    get.mockResolvedValue(current)

    await expect(getCurrentUser()).resolves.toBe(current)
    expect(get).toHaveBeenCalledWith('/auth/me')
  })

  it('posts account lifecycle requests to their endpoints', async () => {
    post.mockResolvedValue({ message: 'ok' })
    await register({
      name: '用户',
      email: 'user@example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
    })
    await verifyEmail('verify-token')
    await resendVerification('user@example.com')
    await forgotPassword('user@example.com')
    await resetPassword({
      token: 'reset-token',
      password: 'new-password',
      passwordConfirmation: 'new-password',
    })

    expect(post.mock.calls).toEqual([
      [
        '/auth/register',
        {
          name: '用户',
          email: 'user@example.com',
          password: 'password123',
          passwordConfirmation: 'password123',
        },
      ],
      ['/auth/verify-email', { token: 'verify-token' }],
      ['/auth/resend-verification', { email: 'user@example.com' }],
      ['/auth/forgot-password', { email: 'user@example.com' }],
      [
        '/auth/reset-password',
        { token: 'reset-token', password: 'new-password', passwordConfirmation: 'new-password' },
      ],
    ])
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useAuthStore } from '../auth.store'

const { getCurrentUser } = vi.hoisted(() => ({ getCurrentUser: vi.fn() }))

vi.mock('../../api/auth.api', () => ({ getCurrentUser }))

describe('auth store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('stores a session and clears it on logout', () => {
    const auth = useAuthStore()

    auth.login({
      accessToken: 'token',
      user: {
        id: '1',
        name: '管理员',
        email: 'admin@example.com',
      },
      permissions: ['user:read'],
    })

    expect(auth.isAuthenticated).toBe(true)
    expect(auth.can('user:read')).toBe(true)

    auth.logout()

    expect(auth.isAuthenticated).toBe(false)
    expect(auth.permissions).toEqual([])
  })

  it('skips remote validation without a stored token', async () => {
    const auth = useAuthStore()

    await auth.initialize()

    expect(getCurrentUser).not.toHaveBeenCalled()
    expect(auth.isInitialized).toBe(true)
  })

  it('refreshes stored user data from the server', async () => {
    localStorage.setItem(
      'pms.auth.session',
      JSON.stringify({
        accessToken: 'token',
        user: { id: 'old', name: '旧资料', email: 'admin@example.com' },
        permissions: [],
      }),
    )
    setActivePinia(createPinia())
    getCurrentUser.mockResolvedValue({
      user: { id: '1', name: '系统管理员', email: 'admin@example.com' },
      permissions: ['user:read'],
    })
    const auth = useAuthStore()

    await Promise.all([auth.initialize(), auth.initialize()])

    expect(getCurrentUser).toHaveBeenCalledTimes(1)
    expect(auth.user?.name).toBe('系统管理员')
    expect(auth.permissions).toEqual(['user:read'])
    expect(auth.accessToken).toBe('token')
  })

  it('clears an invalid stored session', async () => {
    localStorage.setItem(
      'pms.auth.session',
      JSON.stringify({
        accessToken: 'invalid',
        user: { id: '1', name: '管理员', email: 'admin@example.com' },
        permissions: [],
      }),
    )
    setActivePinia(createPinia())
    getCurrentUser.mockRejectedValue(new Error('unauthorized'))
    const auth = useAuthStore()

    await auth.initialize()

    expect(auth.isAuthenticated).toBe(false)
    expect(localStorage.getItem('pms.auth.session')).toBeNull()
  })
})

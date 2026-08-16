import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useAuthStore } from '../auth.store'

describe('auth store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
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
})

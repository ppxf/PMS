import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))

vi.mock('@/services/http', () => ({ http: { get, post } }))

import { getCurrentUser, login } from '../auth.api'

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
})

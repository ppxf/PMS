import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { configureHttpAuthProvider } from '../auth-provider'
import { AppError } from '../app-error'
import { axiosInstance, http } from '../client'

describe('HTTP authentication', () => {
  beforeEach(() => vi.clearAllMocks())

  it('adds the current bearer token to requests', async () => {
    let authorization: unknown
    axiosInstance.defaults.adapter = async (config) => {
      authorization = config.headers.get('Authorization')
      return { config, data: { value: 1 }, headers: {}, status: 200, statusText: 'OK' }
    }
    configureHttpAuthProvider({ getAccessToken: () => 'access-token', onUnauthorized: vi.fn() })

    await http.get('/protected', { unwrap: false })

    expect(authorization).toBe('Bearer access-token')
  })

  it('runs one unauthorized handler for concurrent 401 responses', async () => {
    const onUnauthorized = vi.fn(async () => undefined)
    configureHttpAuthProvider({ getAccessToken: () => 'expired', onUnauthorized })
    axiosInstance.defaults.adapter = async (config) => {
      const response = {
        config,
        data: { success: false, statusCode: 401, message: 'Unauthorized' },
        headers: {},
        status: 401,
        statusText: 'Unauthorized',
      }
      throw new AxiosError(
        'Unauthorized',
        'ERR_BAD_REQUEST',
        { ...config, headers: config.headers ?? new AxiosHeaders() },
        undefined,
        response,
      )
    }

    const results = await Promise.allSettled([http.get('/one'), http.get('/two')])

    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    expect(results.every((result) => result.status === 'rejected')).toBe(true)
    for (const result of results) {
      if (result.status === 'rejected') expect(result.reason).toBeInstanceOf(AppError)
    }
  })
})

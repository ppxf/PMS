import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { configureHttpAuthProvider } from '../auth-provider'
import { AppError } from '../app-error'
import { axiosInstance, http } from '../client'

describe('HTTP authentication', () => {
  beforeEach(() => vi.clearAllMocks())

  it('adds the current bearer token to requests', async () => {
    let authorization: unknown
    axiosInstance.defaults.adapter = (config) => {
      authorization = config.headers.get('Authorization')
      return Promise.resolve({
        config,
        data: { value: 1 },
        headers: {},
        status: 200,
        statusText: 'OK',
      })
    }
    configureHttpAuthProvider({
      getAccessToken: () => 'access-token',
      onUnauthorized: vi.fn<() => void>(),
    })

    await http.get('/protected', { unwrap: false })

    expect(authorization).toBe('Bearer access-token')
  })

  it('runs one unauthorized handler for concurrent 401 responses', async () => {
    const onUnauthorized = vi.fn<() => Promise<void>>(() => Promise.resolve())
    configureHttpAuthProvider({ getAccessToken: () => 'expired', onUnauthorized })
    axiosInstance.defaults.adapter = (config) => {
      const response = {
        config,
        data: { success: false, statusCode: 401, message: 'Unauthorized' },
        headers: {},
        status: 401,
        statusText: 'Unauthorized',
      }
      return Promise.reject(
        new AxiosError(
          'Unauthorized',
          'ERR_BAD_REQUEST',
          { ...config, headers: config.headers ?? new AxiosHeaders() },
          undefined,
          response,
        ),
      )
    }

    const results = await Promise.allSettled([http.get('/one'), http.get('/two')])

    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected'])
    const reasons = results.map((result) =>
      result.status === 'rejected' ? result.reason : undefined,
    )
    expect(reasons[0]).toBeInstanceOf(AppError)
    expect(reasons[1]).toBeInstanceOf(AppError)
  })

  it('rejects a 401 response without waiting for unauthorized navigation to finish', async () => {
    configureHttpAuthProvider({
      getAccessToken: () => 'expired',
      onUnauthorized: () => new Promise<void>(() => undefined),
    })
    axiosInstance.defaults.adapter = (config) => {
      const response = {
        config,
        data: { success: false, statusCode: 401, message: 'Unauthorized' },
        headers: {},
        status: 401,
        statusText: 'Unauthorized',
      }
      return Promise.reject(
        new AxiosError(
          'Unauthorized',
          'ERR_BAD_REQUEST',
          { ...config, headers: config.headers ?? new AxiosHeaders() },
          undefined,
          response,
        ),
      )
    }

    let rejection: unknown
    void http.get('/protected').catch((error: unknown) => {
      rejection = error
    })
    await vi.waitFor(() => expect(rejection).toBeInstanceOf(AppError))
  })
})

describe('management request idempotency', () => {
  it('generates independent management keys and preserves a retried Axios config', async () => {
    const requests: import('axios').InternalAxiosRequestConfig[] = []
    axiosInstance.defaults.adapter = (config) => {
      requests.push(config)
      return Promise.resolve({ config, data: {}, headers: {}, status: 200, statusText: 'OK' })
    }
    await http.post('/groups', { name: 'Team' })
    await http.patch('/workspace/alert-rules/r', { enabled: false })
    const first = requests[0]!
    const key = first.headers.get('Idempotency-Key')
    expect(key).toMatch(/^[A-Za-z0-9_.:-]{8,128}$/)
    expect(requests[1]!.headers.get('Idempotency-Key')).not.toBe(key)
    await axiosInstance.request(first)
    expect(requests[2]!.headers.get('Idempotency-Key')).toBe(key)
    await http.delete('/groups/g/projects/p', { headers: { 'Idempotency-Key': 'caller-key-123' } })
    expect(requests[3]!.headers.get('Idempotency-Key')).toBe('caller-key-123')
    for (const url of ['/auth/login', '/sdk/p', '/project-invitations/accept']) await http.post(url)
    await http.get('/groups')
    expect(requests.slice(4).every((config) => !config.headers.has('Idempotency-Key'))).toBe(true)
  })
})

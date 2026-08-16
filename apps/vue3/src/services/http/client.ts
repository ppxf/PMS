import axios from 'axios'

import { AppError, normalizeHttpError } from './app-error'
import { getHttpAuthProvider } from './auth-provider'

import type { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import type { ApiSuccessResponse } from './types'

export interface HttpRequestConfig<D = unknown> extends AxiosRequestConfig<D> {
  unwrap?: boolean
}

export const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15_000,
  headers: {
    Accept: 'application/json',
  },
})

axiosInstance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getHttpAuthProvider()?.getAccessToken()

  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }

  return config
})

let unauthorizedTask: Promise<void> | null = null

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const appError = normalizeHttpError(error)

    if (appError.status === 401) {
      const provider = getHttpAuthProvider()

      if (provider && !unauthorizedTask) {
        unauthorizedTask = Promise.resolve(provider.onUnauthorized()).finally(() => {
          unauthorizedTask = null
        })
      }

      await unauthorizedTask
    }

    return Promise.reject(appError)
  },
)

function isSuccessResponse<T>(value: unknown): value is ApiSuccessResponse<T> {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<ApiSuccessResponse<T>>
  return candidate.success === true && 'data' in candidate
}

async function request<T, D = unknown>(config: HttpRequestConfig<D>): Promise<T> {
  const { unwrap = true, ...axiosConfig } = config
  const response = await axiosInstance.request<
    ApiSuccessResponse<T> | T,
    AxiosResponse<ApiSuccessResponse<T> | T>,
    D
  >(axiosConfig)

  if (!unwrap) {
    return response.data as T
  }

  return isSuccessResponse<T>(response.data) ? response.data.data : response.data
}

export const http = {
  request,
  get<T>(url: string, config?: HttpRequestConfig): Promise<T> {
    return request<T>({ ...config, method: 'GET', url })
  },
  post<T, D = unknown>(url: string, data?: D, config?: HttpRequestConfig<D>): Promise<T> {
    return request<T, D>({ ...config, data, method: 'POST', url })
  },
  put<T, D = unknown>(url: string, data?: D, config?: HttpRequestConfig<D>): Promise<T> {
    return request<T, D>({ ...config, data, method: 'PUT', url })
  },
  patch<T, D = unknown>(url: string, data?: D, config?: HttpRequestConfig<D>): Promise<T> {
    return request<T, D>({ ...config, data, method: 'PATCH', url })
  },
  delete<T>(url: string, config?: HttpRequestConfig): Promise<T> {
    return request<T>({ ...config, method: 'DELETE', url })
  },
}

export { AppError }

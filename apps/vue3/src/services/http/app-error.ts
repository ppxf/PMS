import axios from 'axios'

import type { ApiErrorResponse } from './types'

export interface AppErrorOptions {
  status?: number
  code?: string
  details?: unknown
  cause?: unknown
}

export class AppError extends Error {
  readonly status?: number
  readonly code?: string
  readonly details?: unknown
  readonly originalCause?: unknown

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message)
    this.name = 'AppError'
    this.status = options.status
    this.code = options.code
    this.details = options.details
    this.originalCause = options.cause
  }
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<ApiErrorResponse>
  return candidate.success === false && typeof candidate.statusCode === 'number'
}

function getErrorMessage(payload: ApiErrorResponse): string {
  return Array.isArray(payload.message) ? payload.message.join('；') : payload.message
}

export function normalizeHttpError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error
  }

  if (axios.isAxiosError(error)) {
    const payload = error.response?.data

    if (isApiErrorResponse(payload)) {
      return new AppError(getErrorMessage(payload), {
        status: payload.statusCode,
        code: payload.error,
        details: payload,
        cause: error,
      })
    }

    if (error.code === 'ERR_CANCELED') {
      return new AppError('请求已取消', {
        code: error.code,
        cause: error,
      })
    }

    return new AppError(error.message || '网络请求失败', {
      status: error.response?.status,
      code: error.code,
      details: payload,
      cause: error,
    })
  }

  if (error instanceof Error) {
    return new AppError(error.message, { cause: error })
  }

  return new AppError('发生未知错误', { details: error })
}

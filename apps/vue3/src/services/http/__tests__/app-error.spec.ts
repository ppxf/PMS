import { describe, expect, it } from 'vitest'

import { AppError, normalizeHttpError } from '../app-error'

describe('normalizeHttpError', () => {
  it('keeps application errors unchanged', () => {
    const source = new AppError('权限不足', { status: 403 })

    expect(normalizeHttpError(source)).toBe(source)
  })

  it('normalizes native errors', () => {
    const result = normalizeHttpError(new Error('boom'))

    expect(result).toBeInstanceOf(AppError)
    expect(result.message).toBe('boom')
  })
})

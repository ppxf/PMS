import { describe, expect, it } from 'vitest'

import { hasPermissions } from '../permissions'

describe('hasPermissions', () => {
  it('supports all and any permission modes', () => {
    const granted = ['user:read']

    expect(hasPermissions(granted, ['user:read', 'user:update'])).toBe(false)
    expect(hasPermissions(granted, ['user:read', 'user:update'], 'any')).toBe(true)
  })

  it('allows wildcard and empty requirements', () => {
    expect(hasPermissions(['*'], ['user:delete'])).toBe(true)
    expect(hasPermissions([], undefined)).toBe(true)
  })
})

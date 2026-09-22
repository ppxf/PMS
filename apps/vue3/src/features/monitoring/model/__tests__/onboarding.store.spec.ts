import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { listGroups } = vi.hoisted(() => ({
  listGroups: vi.fn<() => Promise<unknown>>(),
}))

vi.mock('../../api/monitoring.api', () => ({ listGroups }))

import { useOnboardingStore } from '../onboarding.store'

describe('onboarding store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('distinguishes a loaded empty group list', async () => {
    listGroups.mockResolvedValue([])
    const store = useOnboardingStore()

    await store.load()

    expect(store.loaded).toBe(true)
    expect(store.needsGroup).toBe(true)
    expect(store.error).toBeNull()
  })

  it('stores existing groups', async () => {
    listGroups.mockResolvedValue([{ id: 'group-1', slug: 'acme' }])
    const store = useOnboardingStore()

    await store.load()

    expect(store.needsGroup).toBe(false)
    expect(store.groups).toHaveLength(1)
  })

  it('does not treat a failed request as an empty group list', async () => {
    listGroups.mockRejectedValue(new Error('offline'))
    const store = useOnboardingStore()

    await store.load()

    expect(store.loaded).toBe(false)
    expect(store.needsGroup).toBe(false)
    expect(store.error).toBe('无法加载组信息，请重试')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
const { get } = vi.hoisted(() => ({ get: vi.fn() }))
import { useProjectAccessStore } from '../project-access.store'
vi.mock('@/services/http', () => ({ http: { get } }))
describe('project access isolation', () => {
  it('keeps same-project navigation visible during revalidation and clears on failure', async () => {
    const store = useProjectAccessStore()
    get.mockResolvedValueOnce({ projectId: 'one', role: 'owner', permissions: [] })
    await store.load('user', 'group', 'one')
    let reject!: (reason: Error) => void
    get.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        }),
    )
    const pending = store.load('user', 'group', 'one')
    expect(store.canRoute('project-members')).toBe(true)
    reject(new Error('Forbidden'))
    await expect(pending).rejects.toThrow('Forbidden')
    expect(store.access).toBeNull()
  })
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })
  it('fails closed before access has loaded and grants only selected reads', async () => {
    const store = useProjectAccessStore()
    expect(store.canRoute('project-issues')).toBe(false)
    get.mockResolvedValue({
      projectId: 'one',
      role: 'member',
      permissions: ['project:issues:read'],
    })
    await store.load('user', 'group', 'one')
    expect(store.canRoute('project-issue-detail')).toBe(true)
    expect(store.canRoute('project-traces')).toBe(false)
    expect(store.canRoute('project-setup')).toBe(false)
    expect(store.canRoute('project-detail')).toBe(false)
    expect(store.canRoute('project-members')).toBe(false)
  })
  it('clears previous project access while loading another project and on revocation', async () => {
    const store = useProjectAccessStore()
    get
      .mockResolvedValueOnce({ projectId: 'one', role: 'owner', permissions: [] })
      .mockRejectedValueOnce(new Error('Forbidden'))
    await store.load('user', 'group', 'one')
    expect(store.canRoute('project-members')).toBe(true)
    await expect(store.load('other-user', 'group', 'two')).rejects.toThrow('Forbidden')
    expect(store.access).toBeNull()
    expect(store.canRoute('project-members')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { installNavigationLoading } from '../navigation-loading'

function setup() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/a', '/b', '/c'].map((path) => ({ path, component: { template: '<div />' } })),
  })
  const loading = installNavigationLoading(router)
  return { router, loading }
}

describe('navigation loading', () => {
  it('covers asynchronous guards and clears after success', async () => {
    const { router, loading } = setup()
    await router.push('/a')
    let release!: () => void
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    router.beforeEach(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
          entered()
        }),
    )
    const pending = router.push('/b')
    await started
    expect(loading.value).toBe(true)
    release()
    await pending
    expect(loading.value).toBe(false)
  })

  it('clears after aborted navigation and errors', async () => {
    const { router, loading } = setup()
    await router.push('/a')
    const remove = router.beforeEach(() => false)
    await router.push('/b')
    expect(loading.value).toBe(false)
    remove()
    router.onError(() => {})
    router.beforeEach(() => {
      throw new Error('Failed')
    })
    await expect(router.push('/b')).rejects.toThrow('Failed')
    expect(loading.value).toBe(false)
  })

  it('does not dismiss a newer navigation when a previous guard finishes', async () => {
    const { router, loading } = setup()
    await router.push('/a')
    const releases = new Map<string, () => void>()
    router.beforeEach(
      (to) =>
        new Promise<void>((resolve) => {
          releases.set(to.path, resolve)
        }),
    )
    const first = router.push('/b')
    await new Promise((resolve) => setTimeout(resolve, 0))
    const second = router.push('/c')
    await new Promise((resolve) => setTimeout(resolve, 0))
    releases.get('/b')!()
    await first
    expect(loading.value).toBe(true)
    releases.get('/c')!()
    await second
    expect(loading.value).toBe(false)
  })
})

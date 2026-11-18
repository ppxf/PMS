import { readonly, ref } from 'vue'
import type { Router, RouteLocationNormalized } from 'vue-router'

// Register before authorization so the indicator includes guard and chunk loading.
export function installNavigationLoading(router: Router) {
  const loading = ref(false)
  const recoveryHref = ref<string | null>(null)
  let pending: RouteLocationNormalized | undefined
  router.beforeEach((to) => {
    pending = to
    loading.value = true
    recoveryHref.value = null
  })
  function finish(to: RouteLocationNormalized) {
    if (pending !== to) return
    pending = undefined
    loading.value = false
  }
  router.afterEach(finish)
  router.onError((error, to) => {
    if (pending !== to) return
    finish(to)
    recoveryHref.value = router.resolve(to.fullPath).href
    console.error('Page navigation failed', error)
  })
  return { loading: readonly(loading), recoveryHref: readonly(recoveryHref) }
}

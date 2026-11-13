import { readonly, ref } from 'vue'
import type { Router, RouteLocationNormalized } from 'vue-router'

// Register before authorization so the indicator includes guard and chunk loading.
export function installNavigationLoading(router: Router) {
  const loading = ref(false)
  let pending: RouteLocationNormalized | undefined
  router.beforeEach((to) => {
    pending = to
    loading.value = true
  })
  function finish(to: RouteLocationNormalized) {
    if (pending !== to) return
    pending = undefined
    loading.value = false
  }
  router.afterEach(finish)
  router.onError((_error, to) => finish(to))
  return readonly(loading)
}

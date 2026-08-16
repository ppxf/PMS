import { useAuthStore } from '@/features/auth'

import type { Pinia } from 'pinia'
import type { Router } from 'vue-router'

export function installAuthorizationGuards(router: Router, pinia: Pinia): void {
  const auth = useAuthStore(pinia)

  router.beforeEach((to) => {
    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      return {
        name: 'login',
        query: { redirect: to.fullPath },
      }
    }

    const permissions = Array.isArray(to.meta.permissions)
      ? to.meta.permissions.filter(
          (permission): permission is string => typeof permission === 'string',
        )
      : []
    const permissionMode = to.meta.permissionMode === 'any' ? 'any' : 'all'

    if (permissions.length > 0 && !auth.can(permissions, permissionMode)) {
      return {
        name: 'forbidden',
        query: { from: to.fullPath },
      }
    }

    return true
  })

  router.afterEach((to) => {
    document.title = `${to.meta.title} · PMS CMS`
  })
}

import { useAuthStore } from '@/features/auth'
import { useOnboardingStore } from '@/features/monitoring'

import type { Pinia } from 'pinia'
import type { Router } from 'vue-router'

export function installAuthorizationGuards(router: Router, pinia: Pinia): void {
  const auth = useAuthStore(pinia)
  const onboarding = useOnboardingStore(pinia)

  router.beforeEach(async (to) => {
    await auth.initialize()

    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      return {
        name: 'login',
        query: { redirect: to.fullPath },
      }
    }

    if (to.meta.requiresAuth && auth.isAuthenticated) {
      if (onboarding.loadedForUserId !== auth.user?.id) onboarding.reset()
      await onboarding.load(auth.user?.id ?? null)

      if (onboarding.needsGroup && to.name !== 'create-group-onboarding') {
        return { name: 'create-group-onboarding' }
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

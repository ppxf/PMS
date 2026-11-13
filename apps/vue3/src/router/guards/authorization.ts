import { rememberInvitationRedirect } from '@/features/auth/model/invitation-redirect'
import {
  useProjectAccessStore,
  projectModules,
} from '@/features/monitoring/model/project-access.store'
import { useAuthStore } from '@/features/auth'
import { useOnboardingStore } from '@/features/monitoring'

import type { Pinia } from 'pinia'
import type { Router } from 'vue-router'

export function installAuthorizationGuards(router: Router, pinia: Pinia): void {
  const auth = useAuthStore(pinia)
  const onboarding = useOnboardingStore(pinia)

  window.addEventListener('project-access-forbidden', (event) => {
    const current = router.currentRoute.value
    const path = `/groups/${String(current.params.groupSlug)}/projects/${String(current.params.projectSlug)}`
    if (!String((event as CustomEvent).detail ?? '').startsWith(path)) return
    useProjectAccessStore(pinia).clear()
    void router.replace({ name: 'forbidden' })
  })

  let navigationGeneration = 0
  router.beforeEach(async (to) => {
    const currentGeneration = ++navigationGeneration
    if (to.name === 'project-invitation-accept') {
      rememberInvitationRedirect(to.fullPath)
      sessionStorage.setItem('project-invitation-redirect', to.fullPath)
    }
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

      if (
        onboarding.needsGroup &&
        to.name !== 'create-group-onboarding' &&
        to.name !== 'project-invitation-accept'
      ) {
        return { name: 'create-group-onboarding' }
      }
    }

    if (typeof to.params.groupSlug === 'string' && typeof to.params.projectSlug === 'string') {
      const access = useProjectAccessStore(pinia)
      try {
        const value = await access.load(
          String(auth.user?.id ?? ''),
          to.params.groupSlug,
          to.params.projectSlug,
        )
        if (currentGeneration !== navigationGeneration) return false
        if (!access.canRoute(String(to.name ?? ''))) {
          const module = projectModules.find((module) =>
            value.permissions.includes(`project:${module}:read`),
          )
          if (value.role === 'member' && module)
            return { name: `project-${module}`, params: to.params }
          if (value.role === 'member' && value.permissions.includes('project:audit:read'))
            return { name: 'workspace-audit' }
          return { name: 'forbidden' }
        }
      } catch {
        if (currentGeneration !== navigationGeneration) return false
        access.clear()
        return { name: 'forbidden' }
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

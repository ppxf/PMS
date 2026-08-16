import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { hasPermissions } from './permissions'

import type { PermissionMode, PermissionRequirement } from './permissions'

const SESSION_STORAGE_KEY = 'pms.auth.session'

export interface AuthUser {
  id: string
  name: string
  email: string
}

export interface AuthSession {
  accessToken: string
  user: AuthUser
  permissions: string[]
}

function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<AuthSession>
  return (
    typeof candidate.accessToken === 'string' &&
    Boolean(candidate.user) &&
    Array.isArray(candidate.permissions)
  )
}

function loadSession(): AuthSession | null {
  const serialized = localStorage.getItem(SESSION_STORAGE_KEY)

  if (!serialized) {
    return null
  }

  try {
    const session: unknown = JSON.parse(serialized)
    return isAuthSession(session) ? session : null
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const initialSession = loadSession()
  const accessToken = ref<string | null>(initialSession?.accessToken ?? null)
  const user = ref<AuthUser | null>(initialSession?.user ?? null)
  const permissions = ref<string[]>(initialSession?.permissions ?? [])

  const isAuthenticated = computed(() => Boolean(accessToken.value))

  function login(session: AuthSession): void {
    accessToken.value = session.accessToken
    user.value = session.user
    permissions.value = [...session.permissions]
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  }

  function logout(): void {
    accessToken.value = null
    user.value = null
    permissions.value = []
    localStorage.removeItem(SESSION_STORAGE_KEY)
  }

  function can(
    requirement: PermissionRequirement | undefined,
    mode: PermissionMode = 'all',
  ): boolean {
    return hasPermissions(permissions.value, requirement, mode)
  }

  return {
    accessToken,
    can,
    isAuthenticated,
    login,
    logout,
    permissions,
    user,
  }
})

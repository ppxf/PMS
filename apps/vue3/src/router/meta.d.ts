import 'vue-router'

import type { PermissionMode } from '@/features/auth'

export {}

declare module 'vue-router' {
  interface RouteMeta {
    title: string
    requiresAuth?: boolean
    permissions?: string[]
    permissionMode?: PermissionMode
    layout?: 'app' | 'blank'
  }
}

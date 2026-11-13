import { createRouter, createWebHistory } from 'vue-router'

import { routes } from './routes'
import { installNavigationLoading } from './navigation-loading'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

export const navigationLoading = installNavigationLoading(router)
export default router

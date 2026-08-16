import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'

import App from './App.vue'
import { queryClient } from '@/app/query-client'
import { createPermissionDirective, useAuthStore } from '@/features/auth'
import router from '@/router'
import { installAuthorizationGuards } from '@/router/guards/authorization'
import { configureHttpAuthProvider } from '@/services/http'
import '@/styles/index.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)

const auth = useAuthStore(pinia)

configureHttpAuthProvider({
  getAccessToken: () => auth.accessToken,
  async onUnauthorized() {
    const redirect = router.currentRoute.value.fullPath
    auth.logout()

    if (router.currentRoute.value.name !== 'login') {
      await router.replace({
        name: 'login',
        query: { redirect },
      })
    }
  },
})

app.directive(
  'permission',
  createPermissionDirective((requirement, mode) => auth.can(requirement, mode)),
)

app.use(VueQueryPlugin, { queryClient })
installAuthorizationGuards(router, pinia)
app.use(router)

app.mount('#app')

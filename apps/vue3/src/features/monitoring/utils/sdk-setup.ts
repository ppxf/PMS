export const buildEnvSnippet = (dsn: string) => `VITE_PMS_DSN=${dsn}`

export const buildInstallSnippet = () => 'pnpm add @pms/monitoring-vue'

export const buildInitSnippet = () => `import { createApp } from 'vue'
import { captureException, init as initPmsMonitoring } from '@pms/monitoring-vue'
import App from './App.vue'

const app = createApp(App)

initPmsMonitoring({
  app,
  dsn: import.meta.env.VITE_PMS_DSN,
  environment: import.meta.env.MODE,
})

captureException(new Error('PMS SDK test error'))

app.mount('#app')`

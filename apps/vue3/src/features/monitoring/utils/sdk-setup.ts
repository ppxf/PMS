export const buildEnvSnippet = (dsn: string) => `VITE_PMS_DSN=${dsn}`

export const buildInstallSnippet = () => 'pnpm add ./vendor/pms-monitoring-vue-0.1.0.tgz'

export const buildInitSnippet = () => `import { createApp } from 'vue'
import { init as initPmsMonitoring } from '@pms/monitoring-vue'
import App from './App.vue'

const app = createApp(App)

initPmsMonitoring({
  app,
  dsn: import.meta.env.VITE_PMS_DSN,
  environment: import.meta.env.MODE,
})

app.mount('#app')`

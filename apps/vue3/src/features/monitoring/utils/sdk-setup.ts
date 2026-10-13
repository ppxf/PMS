export const buildEnvSnippet = (dsn: string) => `VITE_PMS_DSN=${dsn}`

export const buildInstallSnippet = (tracingEnabled = false) =>
  `pnpm add @pms/monitoring-vue${tracingEnabled ? ' @pms/monitoring-browser' : ''}`

export const buildBrowserTracesInstallSnippet = () =>
  'pnpm add @pms/monitoring-vue @pms/monitoring-browser'

export const buildBrowserTracesInitSnippet = () => `import { createApp } from 'vue'
import { init } from '@pms/monitoring-vue'
import { browserTracingIntegration } from '@pms/monitoring-browser'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(router)

// 在业务应用启动前初始化；先在 PMS 项目功能配置中启用 Traces。
init({
  app,
  router, // 可选：采集 Vue Router 导航
  dsn: import.meta.env.VITE_PMS_DSN,
  environment: import.meta.env.MODE,
  integrations: [browserTracingIntegration()],
  tracesSampleRate: import.meta.env.DEV ? 1 : 0.1,
})

app.mount('#app')`

export const buildInitSnippet = (tracingEnabled = false) => `import { createApp } from 'vue'
import { captureException, init as initPmsMonitoring } from '@pms/monitoring-vue'
import App from './App.vue'${tracingEnabled ? "\nimport { browserTracingIntegration } from '@pms/monitoring-browser'\nimport router from './router'" : ''}

const app = createApp(App)${tracingEnabled ? '\napp.use(router)' : ''}

initPmsMonitoring({
  app,
  dsn: import.meta.env.VITE_PMS_DSN,
  debug: import.meta.env.DEV,
  environment: import.meta.env.MODE,${tracingEnabled ? '\n  integrations: [browserTracingIntegration()],\n  tracesSampleRate: import.meta.env.DEV ? 1 : 0.1,\n  router, // 可选：追踪 Vue Router 导航' : ''}
})

captureException(new Error('PMS SDK test error'))

app.mount('#app')`

export const buildManualTraceSnippet = () => `<script setup lang="ts">
import { startSpan, flush } from '@pms/monitoring-vue'

// 在完成 Traces 初始化后调用；测试时将 tracesSampleRate 设为 1。
async function triggerTrace() {
  await startSpan(
    { name: '手动 Trace 测试', op: 'business' },
    async (parent) => {
      await startSpan(
        { name: '处理数据', op: 'business', parent },
        async () => {
          // 替换成需要统计耗时的业务操作。
          await new Promise<void>((resolve) => setTimeout(resolve, 200))
        },
      )
    },
  )
  // 等待已结束的 Trace 上报；日常业务通常无需手动调用。
  await flush()
}
</script>

<template>
  <button type="button" @click="triggerTrace">触发测试 Trace</button>
</template>`

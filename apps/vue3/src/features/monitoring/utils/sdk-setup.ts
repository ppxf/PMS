export const buildEnvSnippet = (dsn: string) => `VITE_PMS_DSN=${dsn}`

export const buildMetricsInitSnippet = () => `import { createApp } from 'vue'
import { init } from '@pms/monitoring-vue'
import App from './App.vue'

const app = createApp(App)

// Enable Application Metrics in the PMS project settings first.
// Update your existing initialization instead of initializing a second time.
init({
  app,
  dsn: import.meta.env.VITE_PMS_DSN,
  environment: import.meta.env.MODE,
  enableMetrics: true,
})

app.mount('#app')`

export const buildMetricsUsageSnippet = () => `<script setup lang="ts">
import { metrics, flush, getMetricStats } from '@pms/monitoring-vue'

async function recordMetrics() {
  // Counter: report an increment, not a running total. The value defaults to 1.
  metrics.count('button_click', 1, {
    attributes: { button: 'checkout', route: '/cart' },
  })

  // Gauge: report the current value at this moment.
  metrics.gauge('cart_items', 3, {
    attributes: { route: '/cart', signed_in: true },
  })

  // Distribution: report each observation for averages and percentiles.
  const started = performance.now()
  // Replace this delay with the operation you want to measure.
  await new Promise<void>((resolve) => setTimeout(resolve, 200))
  metrics.distribution('checkout_duration', performance.now() - started, {
    unit: 'millisecond',
    attributes: { route: '/cart', successful: true },
  })

  // For verification: send buffered samples now. Normal reporting is batched.
  await flush()
  console.info('Metric reporting state', getMetricStats())
}
</script>

<template>
  <button type="button" @click="recordMetrics">Send test metrics</button>
</template>`

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

// Initialize before starting the application. Enable Traces in the PMS project settings first.
init({
  app,
  router, // Optional: capture Vue Router navigation
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
  environment: import.meta.env.MODE,${tracingEnabled ? '\n  integrations: [browserTracingIntegration()],\n  tracesSampleRate: import.meta.env.DEV ? 1 : 0.1,\n  router, // Optional: trace Vue Router navigation' : ''}
})

captureException(new Error('PMS SDK test error'))

app.mount('#app')`

export const buildManualTraceSnippet = () => `<script setup lang="ts">
import { startSpan, flush } from '@pms/monitoring-vue'

// Call after initializing Traces. Set tracesSampleRate to 1 for testing.
async function triggerTrace() {
  await startSpan(
    { name: 'Manual trace test', op: 'business' },
    async (parent) => {
      await startSpan(
        { name: 'Process data', op: 'business', parent },
        async () => {
          // Replace with the business operation you want to measure.
          await new Promise<void>((resolve) => setTimeout(resolve, 200))
        },
      )
    },
  )
  // Wait for completed traces to be sent. Normal application code usually does not need this call.
  await flush()
}
</script>

<template>
  <button type="button" @click="triggerTrace">Trigger test trace</button>
</template>`

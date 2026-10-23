<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ dsn: string }>()
const snippet = computed(
  () => `import { init, browserTracingIntegration, browserProfilingIntegration, uiProfiler } from '@pms/monitoring-vue'

init({
  app,
  router,
  dsn: ${JSON.stringify(props.dsn || 'YOUR_PROJECT_DSN')},
  integrations: [browserTracingIntegration(), browserProfilingIntegration()],
  tracesSampleRate: 1,
  profileSessionSampleRate: 1,
  profileLifecycle: 'trace',
})

// For independent manual collection, set profileLifecycle: 'manual'.
uiProfiler.startProfiler({ name: 'Checkout' })
// Run the interaction to measure, then stop:
await uiProfiler.stopProfiler()`,
)
const headers = `// vite.config.ts (development and preview)
server: { headers: { 'Document-Policy': 'js-profiling' } },
preview: { headers: { 'Document-Policy': 'js-profiling' } }

# nginx: production HTML document response
add_header Document-Policy "js-profiling" always;`
</script>
<template>
  <details class="rounded-lg border bg-background p-4">
    <summary class="cursor-pointer font-medium">Profiles SDK setup</summary>
    <div class="mt-4 space-y-4 text-sm">
      <p>
        Enable Profiles for this project, then install <code>@pms/monitoring-vue</code>. Profiling
        requires Chromium with the JS Self-Profiling API and the HTML document response header
        <code>Document-Policy: js-profiling</code>. Unsupported browsers safely skip collection.
      </p>
      <pre class="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{{
        snippet
      }}</pre>
      <p>
        Trace mode collects during sampled root spans and requires browserTracingIntegration. Manual
        mode works independently of trace sampling. Session sampling is decided once at SDK
        initialization; lower profileSessionSampleRate in production. Captures are bounded to 30
        seconds.
      </p>
      <pre class="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{{
        headers
      }}</pre>
      <p>
        Set this header on the HTML document in development and production, including your CDN or
        reverse proxy; an API response header alone does not enable profiling. This release displays
        original browser function names and does not apply Source Maps.
      </p>
    </div>
  </details>
</template>

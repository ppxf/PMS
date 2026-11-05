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
const headers = `// vite.config.ts (or vite.config.js)
import { defineConfig } from 'vite'

export default defineConfig({
  // Merge into your existing config; keep plugins and other options.
  server: {
    headers: { 'Document-Policy': 'js-profiling' },
  },
  preview: {
    headers: { 'Document-Policy': 'js-profiling' },
  },
})`
const productionHeaders = `# nginx.conf: inside the server block serving your application's HTML
add_header Document-Policy "js-profiling" always;`
</script>
<template>
  <div class="rounded-lg border bg-background p-4">
    <h2 class="font-medium">Profiles SDK setup</h2>
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
      <h3 class="font-medium">Configure the HTML response header</h3>
      <p>
        <code>Document-Policy: js-profiling</code> is an HTTP response header sent by the server
        hosting the application you monitor. Configure it on that application's HTML document,
        including direct visits to client-side routes. Adding it to SDK upload requests or only to
        the PMS API response does not grant profiling permission. The SDK cannot add this header to
        an already loaded document.
      </p>
      <p>
        For Vite development and local preview, merge these options into your existing
        configuration, then restart the server and reload the application page:
      </p>
      <pre class="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{{
        headers
      }}</pre>
      <p>
        Vite's server and preview settings apply to their respective servers. A production
        <code>vite build</code> requires the deployed web server, CDN or reverse proxy to send the
        header. For Nginx, add the following to the server block serving the HTML, reload Nginx, and
        refresh cached HTML at the CDN when applicable. If a location block has its own
        <code>add_header</code> directives, ensure the document response still includes this policy.
      </p>
      <pre class="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{{
        productionHeaders
      }}</pre>
    </div>
  </div>
</template>

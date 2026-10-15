<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  buildManualTraceSnippet,
  buildEnvSnippet,
  buildInitSnippet,
  buildInstallSnippet,
  buildBrowserTracesInstallSnippet,
  buildBrowserTracesInitSnippet,
  buildMetricsInitSnippet,
} from '../utils/sdk-setup'
import MetricsSetupGuide from '../components/MetricsSetupGuide.vue'
import { updateProjectOrigins, getProject, getProjectConnection } from '../api/monitoring.api'
import type { MonitoringProject } from '../model/types'

const route = useRoute()
const isTracesSetup = computed(() => route.name === 'project-traces-setup')
const isMetricsSetup = computed(() => route.name === 'project-metrics-setup')
const groupSlug = computed(() => String(route.params.groupSlug))
const projectSlug = computed(() => String(route.params.projectSlug))
const project = ref<MonitoringProject | null>(null)
const loading = ref(true)
const error = ref('')
const copied = ref('')
const actionError = ref('')
const originsInput = ref('*')
const savingOrigins = ref(false)
const refreshingOrigins = ref(false)
let scopeVersion = 0
onUnmounted(() => {
  scopeVersion++
})

function applyProject(result: MonitoringProject): void {
  project.value = result
  originsInput.value = (result.allowedOrigins ?? ['*']).join('\n')
}

async function saveOrigins(): Promise<void> {
  const version = scopeVersion
  const origins = [
    ...new Set(
      originsInput.value
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ]
  const valid =
    (origins.length === 1 && origins[0] === '*') ||
    origins.every((value) => {
      try {
        const url = new URL(value)
        return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value
      } catch {
        return false
      }
    })
  actionError.value = ''
  if (origins.length > 20) {
    actionError.value = 'Up to 20 origins are allowed.'
    return
  }
  if (!valid) {
    actionError.value = 'Enter an exact http(s) origin on each line, or use * by itself.'
    return
  }
  savingOrigins.value = true
  try {
    const result = await updateProjectOrigins(groupSlug.value, projectSlug.value, origins)
    if (version === scopeVersion) applyProject(result)
  } catch {
    if (version === scopeVersion)
      actionError.value = 'Unable to save origin settings. Please try again.'
  } finally {
    if (version === scopeVersion) savingOrigins.value = false
  }
}

async function refreshOrigins(): Promise<void> {
  const version = scopeVersion
  refreshingOrigins.value = true
  actionError.value = ''
  try {
    const result = await getProject(groupSlug.value, projectSlug.value)
    if (version === scopeVersion) applyProject(result)
  } catch {
    if (version === scopeVersion)
      actionError.value = 'Unable to refresh origin settings. Please try again.'
  } finally {
    if (version === scopeVersion) refreshingOrigins.value = false
  }
}

const manualTraceSnippet = buildManualTraceSnippet()
const envSnippet = computed(() => (project.value ? buildEnvSnippet(project.value.dsn) : ''))
const installSnippet = computed(() =>
  isTracesSetup.value ? buildBrowserTracesInstallSnippet() : buildInstallSnippet(),
)
const initSnippet = computed(() =>
  isMetricsSetup.value
    ? buildMetricsInitSnippet()
    : isTracesSetup.value
      ? buildBrowserTracesInitSnippet()
      : buildInitSnippet(),
)

async function load(): Promise<void> {
  const version = scopeVersion
  loading.value = true
  error.value = ''
  try {
    const result = await getProject(groupSlug.value, projectSlug.value)
    if (version === scopeVersion) {
      applyProject(result)
    }
  } catch {
    if (version === scopeVersion) error.value = 'Unable to load SDK setup information'
  } finally {
    if (version === scopeVersion) loading.value = false
  }
}

async function copy(value: string, label: string): Promise<void> {
  const version = scopeVersion
  try {
    await navigator.clipboard.writeText(value)
    if (version === scopeVersion) copied.value = label
  } catch {
    if (version === scopeVersion)
      actionError.value = 'Unable to copy. Please copy the code manually.'
  }
}

async function refreshConnection(): Promise<void> {
  if (!project.value) return
  const version = scopeVersion
  try {
    const connection = await getProjectConnection(groupSlug.value, projectSlug.value)
    if (version === scopeVersion && project.value) {
      project.value.connected = connection.connected
      project.value.lastSeenAt = connection.lastSeenAt
    }
  } catch {
    if (version === scopeVersion)
      actionError.value = 'Unable to refresh connection status. Please try again.'
  }
}

watch(
  [groupSlug, projectSlug],
  () => {
    scopeVersion++
    project.value = null
    actionError.value = ''
    copied.value = ''
    savingOrigins.value = false
    refreshingOrigins.value = false
    void load()
  },
  { immediate: true },
)
</script>

<template>
  <section class="space-y-6">
    <p v-if="loading" class="text-muted-foreground">Loading…</p>
    <p v-else-if="error" role="alert" class="text-destructive">{{ error }}</p>
    <template v-else-if="project">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 class="text-2xl font-semibold tracking-tight">
            {{ isMetricsSetup ? 'Metrics setup' : isTracesSetup ? 'Traces setup' : 'Basic setup' }}
          </h2>
          <p class="mt-1 text-muted-foreground">
            {{ project.name }} ·
            {{
              isMetricsSetup
                ? 'Set up custom application measurements.'
                : isTracesSetup
                  ? 'Set up browser page and HTTP performance tracing.'
                  : 'Set up Vue and browser error monitoring.'
            }}
          </p>
        </div>
        <Badge :variant="project.connected ? 'default' : 'secondary'">
          {{ project.connected ? 'Connected' : 'Awaiting connection' }}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle class="text-base">1. Install the SDK</CardTitle>
          <CardDescription
            >Install the Vue SDK from the private npm registry. Your package manager also installs
            its Core runtime dependency.</CardDescription
          >
        </CardHeader>
        <CardContent class="space-y-3">
          <pre class="overflow-x-auto rounded-lg bg-muted p-4 text-xs">{{ installSnippet }}</pre>
          <Button variant="outline" @click="copy(installSnippet, 'install command')"
            >Copy install command</Button
          >
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-base">2. Configure the DSN</CardTitle>
          <CardDescription
            >Add the project DSN to your application's .env.local file.</CardDescription
          >
        </CardHeader>
        <CardContent class="space-y-3">
          <pre class="overflow-x-auto rounded-lg bg-muted p-4 text-xs">{{ project.dsn }}</pre>
          <Button data-testid="copy-dsn" variant="outline" @click="copy(project.dsn, 'DSN')"
            >Copy DSN</Button
          >
          <pre class="overflow-x-auto rounded-lg bg-muted p-4 text-xs">{{ envSnippet }}</pre>
          <Button variant="outline" @click="copy(envSnippet, 'environment variables')"
            >Copy environment variables</Button
          >
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-base">3. Initialize the SDK</CardTitle>
          <CardDescription>
            <template v-if="isMetricsSetup"
              >Enable Application Metrics in Project settings and set enableMetrics: true in your
              application's main.ts. If the SDK is already initialized, merge these options into
              that initialization and initialize only once. Traces are optional for metric
              reporting.</template
            >
            <template v-else-if="isTracesSetup"
              >Initialize in your application's main.ts to automatically capture page loads, Vue
              Router navigation, and fetch/XHR. If basic setup is already configured, update the
              existing initialization and initialize only once.</template
            >
            <template v-else
              >Initialize in your application's main.ts. Initialization sends a connection report
              and automatically captures Vue, window.error, and unhandledrejection errors. Use
              captureException for manual verification or reporting.</template
            >
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-3">
          <pre
            data-testid="init-snippet"
            class="overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-4 text-xs text-slate-100"
            >{{ initSnippet }}</pre>
          <div class="flex flex-wrap gap-2">
            <Button
              data-testid="copy-init"
              variant="outline"
              @click="copy(initSnippet, 'initialization code')"
              >Copy initialization code</Button
            >
            <Button data-testid="refresh-connection" @click="refreshConnection"
              >Refresh connection status</Button
            >
          </div>
          <p v-if="copied" role="status" class="text-sm text-muted-foreground">
            Copied {{ copied }}
          </p>
          <p v-if="project.lastSeenAt" class="text-sm text-muted-foreground">
            Last connected:
            {{
              new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
                new Date(project.lastSeenAt),
              )
            }}
          </p>
        </CardContent>
      </Card>
      <MetricsSetupGuide
        v-if="isMetricsSetup"
        :metrics-enabled="project.metricsEnabled"
        :group-slug="groupSlug"
        :project-slug="projectSlug"
        :copied="copied"
        @copy="copy"
      />
      <Card v-if="isTracesSetup" data-testid="manual-trace-setup">
        <CardHeader>
          <CardTitle class="text-base">4. Trigger a manual trace</CardTitle>
          <CardDescription>
            Add this code to a Vue component in your application. Click the button to record a
            business operation and its child operation.
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <p class="text-sm text-muted-foreground">
            Enable Traces in the project settings and complete the SDK initialization above. Set
            tracesSampleRate to 1 for testing. Manual traces also follow the sampling configuration.
          </p>
          <pre
            data-testid="manual-trace-snippet"
            class="overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-4 text-xs text-slate-100"
            >{{ manualTraceSnippet }}</pre>
          <Button
            data-testid="copy-manual-trace"
            variant="outline"
            @click="copy(manualTraceSnippet, 'manual trace example')"
          >
            Copy manual trace example
          </Button>
          <p
            v-if="copied === 'manual trace example'"
            role="status"
            class="text-sm text-muted-foreground"
          >
            Copied manual trace example
          </p>
          <p class="text-sm text-muted-foreground">
            startSpan ends automatically when a synchronous callback returns or an asynchronous
            callback completes. Exceptions mark the span as error and are rethrown. Link child
            operations through parent. To control when a span ends, use startInactiveSpan and call
            span.end('ok') on completion or span.end('error') on failure.
          </p>
          <p class="text-sm text-muted-foreground">
            After clicking, open Traces, select All spans in Quick query, and filter span.name equal
            to Manual trace test. Click Update chart, then click a record name in Span Samples to
            view the full trace. The default Page performance filter does not show this business
            operation.
          </p>
        </CardContent>
      </Card>
      <Card data-testid="origins-settings">
        <CardHeader>
          <CardTitle class="text-base">Optional: restrict SDK reporting origins</CardTitle>
          <CardDescription
            >All origins are allowed by default. Enter up to 20 exact http(s) origins, one per line,
            or use * by itself. Leave blank to block all browser origins.</CardDescription
          >
        </CardHeader>
        <CardContent class="space-y-3">
          <p data-testid="allowed-origins" class="text-sm">
            {{
              project.allowedOrigins?.includes('*') || !project.allowedOrigins
                ? 'All origins allowed'
                : project.allowedOrigins.length
                  ? project.allowedOrigins.join(', ')
                  : 'Browser origins blocked'
            }}
          </p>
          <label for="sdk-origins" class="text-sm">Allowed origins (one per line)</label>
          <Textarea
            id="sdk-origins"
            v-model="originsInput"
            data-testid="origins-input"
            class="min-h-24"
          />
          <div class="flex flex-wrap gap-2">
            <Button
              data-testid="save-origins"
              :disabled="savingOrigins || refreshingOrigins"
              @click="saveOrigins"
              >{{ savingOrigins ? 'Saving…' : 'Save origin settings' }}</Button
            >
            <Button
              data-testid="refresh-origins"
              variant="outline"
              :disabled="savingOrigins || refreshingOrigins"
              @click="refreshOrigins"
              >Refresh origin settings</Button
            >
          </div>
          <p v-if="actionError" role="alert" class="text-destructive">{{ actionError }}</p>
        </CardContent>
      </Card>
    </template>
  </section>
</template>

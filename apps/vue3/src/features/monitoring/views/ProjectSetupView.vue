<script setup lang="ts">
import { intlLocale } from '@/i18n'
import { translate } from '@/i18n'

import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { RefreshCw } from '@lucide/vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  buildManualTraceSnippet,
  buildEnvSnippet,
  buildInitSnippet,
  buildInstallSnippet,
  buildBrowserTracesInstallSnippet,
  buildBrowserTracesInitSnippet,
  buildMetricsInitSnippet,
  buildLogsInitSnippet,
} from '../utils/sdk-setup'
import MetricsSetupGuide from '../components/MetricsSetupGuide.vue'
import { getProject, getProjectConnection } from '../api/monitoring.api'
import type { MonitoringProject } from '../model/types'

const route = useRoute()
const isTracesSetup = computed(() => route.name === 'project-traces-setup')
const isMetricsSetup = computed(() => route.name === 'project-metrics-setup')
const isLogsSetup = computed(() => route.name === 'project-logs-setup')
const groupSlug = computed(() => String(route.params.groupSlug))
const projectSlug = computed(() => String(route.params.projectSlug))
const project = ref<MonitoringProject | null>(null)
const loading = ref(true)
const error = ref('')
const actionError = ref('')
let scopeVersion = 0
onUnmounted(() => {
  scopeVersion++
})

const manualTraceSnippet = buildManualTraceSnippet()
const envSnippet = computed(() => (project.value ? buildEnvSnippet(project.value.dsn) : ''))
const installSnippet = computed(() =>
  isTracesSetup.value ? buildBrowserTracesInstallSnippet() : buildInstallSnippet(),
)
const initSnippet = computed(() => {
  if (isLogsSetup.value) return buildLogsInitSnippet()
  if (isMetricsSetup.value) return buildMetricsInitSnippet()
  if (isTracesSetup.value) return buildBrowserTracesInitSnippet()
  return buildInitSnippet()
})

async function load(): Promise<void> {
  const version = scopeVersion
  loading.value = true
  error.value = ''
  try {
    const result = await getProject(groupSlug.value, projectSlug.value)
    if (version === scopeVersion) {
      project.value = result
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
    if (version === scopeVersion) {
      actionError.value = ''
      toast.success(`Copied ${label}`, undefined, 2000)
    }
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
    void load()
  },
  { immediate: true },
)
</script>

<template>
  <section class="space-y-6">
    <p v-if="loading" class="text-muted-foreground">{{ translate('Loading…') }}</p>
    <p v-else-if="error" role="alert" class="text-destructive">{{ translate(error) }}</p>
    <template v-else-if="project">
      <p v-if="actionError" role="alert" class="text-destructive">{{ translate(actionError) }}</p>
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 class="page-title">
            {{
              translate(
                isLogsSetup
                  ? 'Logs setup'
                  : isMetricsSetup
                    ? 'Metrics setup'
                    : isTracesSetup
                      ? 'Traces setup'
                      : 'Basic setup',
              )
            }}
          </h2>
          <p class="mt-1 text-muted-foreground">
            {{ project.name }} ·
            {{
              translate(
                isLogsSetup
                  ? 'Set up structured application logs.'
                  : isMetricsSetup
                    ? 'Set up custom application measurements.'
                    : isTracesSetup
                      ? 'Set up browser page and HTTP performance tracing.'
                      : 'Set up Vue, browser errors, and automatic Web Vitals monitoring.',
              )
            }}
          </p>
        </div>
        <div data-testid="sdk-connection-status" class="space-y-1 text-sm sm:text-right">
          <Badge :variant="project.connected ? 'default' : 'secondary'">
            {{
              translate(project.connected ? 'Previously connected' : 'Awaiting first connection')
            }}
          </Badge>
          <p v-if="project.lastSeenAt" class="text-muted-foreground">
            {{ translate('Last report received:') }}
            <time :datetime="project.lastSeenAt">{{
              new Intl.DateTimeFormat(intlLocale(), {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(project.lastSeenAt))
            }}</time>
          </p>
          <p class="text-xs text-muted-foreground">
            {{ translate('Historical SDK activity, not live status.') }}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle class="text-base">{{ translate('1. Install the SDK') }}</CardTitle>
          <CardDescription>{{
            translate(
              'Install the Vue SDK from the private npm registry. Your package manager also installs its Core runtime dependency.',
            )
          }}</CardDescription>
        </CardHeader>
        <CardContent class="space-y-3">
          <pre class="code-block" tabindex="0">{{ installSnippet }}</pre>
          <Button variant="outline" @click="copy(installSnippet, 'install command')">{{
            translate('Copy install command')
          }}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-base">{{ translate('2. Configure the DSN') }}</CardTitle>
          <CardDescription>{{
            translate("Add the project DSN to your application's .env.local file.")
          }}</CardDescription>
        </CardHeader>
        <CardContent class="space-y-3">
          <pre class="code-block" tabindex="0">{{ project.dsn }}</pre>
          <Button data-testid="copy-dsn" variant="outline" @click="copy(project.dsn, 'DSN')">{{
            translate('Copy DSN')
          }}</Button>
          <pre class="code-block" tabindex="0">{{ envSnippet }}</pre>
          <Button variant="outline" @click="copy(envSnippet, 'environment variables')">{{
            translate('Copy environment variables')
          }}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-base">{{ translate('3. Initialize the SDK') }}</CardTitle>
          <CardDescription>
            <template v-if="isLogsSetup">{{
              translate(
                "Set enableLogs: true in your application's main.ts. If the SDK is already initialized, add this option to the existing initialization. Send a test log and check the Logs page for the current project.",
              )
            }}</template>
            <template v-else-if="isMetricsSetup">{{
              translate(
                "Enable Application Metrics in Project settings and set enableMetrics: true in your application's main.ts. If the SDK is already initialized, merge these options into that initialization and initialize only once. Traces are optional for metric reporting.",
              )
            }}</template>
            <template v-else-if="isTracesSetup">{{
              translate(
                "Initialize in your application's main.ts to automatically capture page loads, Vue Router navigation, and fetch/XHR. If basic setup is already configured, update the existing initialization and initialize only once.",
              )
            }}</template>
            <template v-else>{{
              translate(
                "Initialize in your application's main.ts. Initialization sends a connection report and automatically captures Vue, window.error, and unhandledrejection errors, plus LCP, INP, CLS, FCP, and TTFB. Web Vitals work without enabling Traces or custom Metrics. INP requires a real interaction; some measurements arrive when the page is hidden. Use captureException for manual verification or reporting.",
              )
            }}</template>
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-3">
          <pre data-testid="init-snippet" class="code-block" tabindex="0">{{ initSnippet }}</pre>
          <div class="flex flex-wrap gap-2">
            <Button
              data-testid="copy-init"
              variant="outline"
              @click="copy(initSnippet, 'initialization code')"
              >{{ translate('Copy initialization code') }}</Button
            >
            <Button
              data-testid="refresh-connection"
              variant="outline"
              size="icon"
              :title="translate('Refresh connection status')"
              :aria-label="translate('Refresh connection status')"
              @click="refreshConnection"
            >
              <RefreshCw class="size-4" aria-hidden="true" />
            </Button>
          </div>
        </CardContent>
      </Card>
      <MetricsSetupGuide
        v-if="isMetricsSetup"
        :metrics-enabled="project.metricsEnabled"
        :group-slug="groupSlug"
        :project-slug="projectSlug"
        @copy="copy"
      />
      <Card v-if="isTracesSetup" data-testid="manual-trace-setup">
        <CardHeader>
          <CardTitle class="text-base">{{ translate('4. Trigger a manual trace') }}</CardTitle>
          <CardDescription>
            {{
              translate(
                'Add this code to a Vue component in your application. Click the button to record a business operation and its child operation.',
              )
            }}
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <p class="text-sm text-muted-foreground">
            {{
              translate(
                'Enable Traces in the project settings and complete the SDK initialization above. Set tracesSampleRate to 1 for testing. Manual traces also follow the sampling configuration.',
              )
            }}
          </p>
          <pre data-testid="manual-trace-snippet" class="code-block" tabindex="0">{{
            manualTraceSnippet
          }}</pre>
          <Button
            data-testid="copy-manual-trace"
            variant="outline"
            @click="copy(manualTraceSnippet, 'manual trace example')"
          >
            {{ translate('Copy manual trace example') }}
          </Button>
          <p class="text-sm text-muted-foreground">
            {{
              translate(
                "startSpan ends automatically when a synchronous callback returns or an asynchronous callback completes. Exceptions mark the span as error and are rethrown. Link child operations through parent. To control when a span ends, use startInactiveSpan and call span.end('ok') on completion or span.end('error') on failure.",
              )
            }}
          </p>
          <p class="text-sm text-muted-foreground">
            {{
              translate(
                'After clicking, open Traces, select All spans in Quick query, and filter span.name equal to Manual trace test. Click a record name in Span Samples to view the full trace. The default Page performance filter does not show this business operation.',
              )
            }}
          </p>
        </CardContent>
      </Card>
    </template>
  </section>
</template>

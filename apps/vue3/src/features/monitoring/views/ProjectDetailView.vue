<script setup lang="ts">
import { translate } from '@/i18n'

import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { RefreshCw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  getProject,
  updateProjectOrigins,
  updateProjectTracing,
  updateProjectMetrics,
  updateProjectLogging,
  updateProjectErrorMonitoring,
} from '../api/monitoring.api'
import { updateProfiles } from '../api/profiles.api'
import type { MonitoringProject } from '../model/types'

const route = useRoute()
const groupSlug = computed(() => String(route.params.groupSlug))
const projectSlug = computed(() => String(route.params.projectSlug))
const project = ref<MonitoringProject | null>(null)
const error = ref('')
const actionError = ref('')
const originsInput = ref('*')
const savingOrigins = ref(false)
const refreshingOrigins = ref(false)
type FeatureKey =
  | 'errorMonitoringEnabled'
  | 'loggingEnabled'
  | 'tracingEnabled'
  | 'metricsEnabled'
  | 'profilesEnabled'
const saving = ref<FeatureKey | null>(null)
let generation = 0
const updates = {
  errorMonitoringEnabled: updateProjectErrorMonitoring,
  loggingEnabled: updateProjectLogging,
  tracingEnabled: updateProjectTracing,
  metricsEnabled: updateProjectMetrics,
  profilesEnabled: updateProfiles,
}
async function toggleFeature(key: FeatureKey, label: string) {
  if (!project.value || saving.value) return
  const current = generation
  saving.value = key
  error.value = ''
  try {
    const next = await updates[key](groupSlug.value, projectSlug.value, !project.value[key])
    if (current === generation) project.value = next
  } catch {
    if (current === generation)
      error.value = `Unable to update ${label} settings. Please try again.`
  } finally {
    if (current === generation) saving.value = null
  }
}

function applyProject(result: MonitoringProject): void {
  project.value = result
  originsInput.value = (result.allowedOrigins ?? ['*']).join('\n')
}

async function saveOrigins(): Promise<void> {
  const version = generation
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
    if (version === generation) applyProject(result)
  } catch {
    if (version === generation)
      actionError.value = 'Unable to save origin settings. Please try again.'
  } finally {
    if (version === generation) savingOrigins.value = false
  }
}

async function refreshOrigins(): Promise<void> {
  const version = generation
  refreshingOrigins.value = true
  actionError.value = ''
  try {
    const result = await getProject(groupSlug.value, projectSlug.value)
    if (version === generation) applyProject(result)
  } catch {
    if (version === generation)
      actionError.value = 'Unable to refresh origin settings. Please try again.'
  } finally {
    if (version === generation) refreshingOrigins.value = false
  }
}

const featureLabels = [
  ['errorMonitoringEnabled', 'Error Monitoring'],
  ['loggingEnabled', 'Logging'],
  ['tracingEnabled', 'Tracing'],
  ['metricsEnabled', 'Application Metrics'],
  ['profilesEnabled', 'Profiles'],
] as const

watch(
  [groupSlug, projectSlug],
  async () => {
    const current = ++generation
    project.value = null
    error.value = ''
    saving.value = null
    actionError.value = ''
    savingOrigins.value = false
    refreshingOrigins.value = false
    try {
      const next = await getProject(groupSlug.value, projectSlug.value)
      if (current === generation) applyProject(next)
    } catch {
      if (current === generation) error.value = 'Unable to load project details'
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  generation++
})
</script>

<template>
  <section class="space-y-6">
    <p v-if="error" role="alert" class="text-destructive">{{ translate(error) }}</p>
    <template v-if="project">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 class="page-title">{{ project.name }}</h2>
        </div>
      </div>

      <Card data-testid="feature-settings">
        <CardHeader>
          <CardTitle class="text-base">{{ translate('Feature settings') }}</CardTitle>
          <CardDescription>{{
            translate('Manage data collection and enabled features.')
          }}</CardDescription>
        </CardHeader>
        <CardContent class="grid gap-3 sm:grid-cols-2">
          <div
            v-for="[key, label] in featureLabels"
            :key="key"
            class="flex items-center justify-between rounded-lg border p-3"
          >
            <span>{{ translate(label) }}</span>
            <Badge
              as="button"
              type="button"
              role="switch"
              :aria-label="translate(label)"
              :aria-checked="project[key]"
              :aria-busy="saving === key"
              :disabled="saving !== null"
              :variant="project[key] ? 'default' : 'secondary'"
              :title="translate(`${project[key] ? 'Disable' : 'Enable'} ${label}`)"
              class="h-8 min-w-24 cursor-pointer px-4 py-1.5 text-sm hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
              @click="toggleFeature(key, label)"
              >{{
                translate(saving === key ? 'Saving…' : project[key] ? 'Enabled' : 'Disabled')
              }}</Badge
            >
          </div>
        </CardContent>
      </Card>
      <Card data-testid="origins-settings">
        <CardHeader>
          <CardTitle class="text-base">{{ translate('SDK reporting origins') }}</CardTitle>
          <CardDescription>{{
            translate(
              'All origins are allowed by default. Enter up to 20 exact http(s) origins, one per line, or use * by itself. Leave blank to block all browser origins.',
            )
          }}</CardDescription>
        </CardHeader>
        <CardContent class="space-y-3">
          <p data-testid="allowed-origins" class="text-sm">
            {{
              translate(
                project.allowedOrigins?.includes('*') || !project.allowedOrigins
                  ? 'All origins allowed'
                  : project.allowedOrigins.length
                    ? project.allowedOrigins.join(', ')
                    : 'Browser origins blocked',
              )
            }}
          </p>
          <label for="sdk-origins" class="text-sm">{{
            translate('Allowed origins (one per line)')
          }}</label>
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
              >{{ translate(savingOrigins ? 'Saving…' : 'Save origin settings') }}</Button
            >
            <Button
              data-testid="refresh-origins"
              variant="outline"
              size="icon"
              :title="translate('Refresh origin settings')"
              :aria-label="translate('Refresh origin settings')"
              :disabled="savingOrigins || refreshingOrigins"
              @click="refreshOrigins"
            >
              <RefreshCw class="size-4" aria-hidden="true" />
            </Button>
          </div>
          <p v-if="actionError" role="alert" class="text-destructive">
            {{ translate(actionError) }}
          </p>
        </CardContent>
      </Card>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  getProject,
  updateProjectTracing,
  updateProjectMetrics,
  updateProjectLogging,
  updateProjectErrorMonitoring,
} from '../api/monitoring.api'
import type { MonitoringProject } from '../model/types'

const route = useRoute()
const groupSlug = computed(() => String(route.params.groupSlug))
const projectSlug = computed(() => String(route.params.projectSlug))
const project = ref<MonitoringProject | null>(null)
const error = ref('')
type FeatureKey = 'errorMonitoringEnabled' | 'loggingEnabled' | 'tracingEnabled' | 'metricsEnabled'
const saving = ref<FeatureKey | null>(null)
let generation = 0
const updates = {
  errorMonitoringEnabled: updateProjectErrorMonitoring,
  loggingEnabled: updateProjectLogging,
  tracingEnabled: updateProjectTracing,
  metricsEnabled: updateProjectMetrics,
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

const featureLabels = [
  ['errorMonitoringEnabled', 'Error Monitoring'],
  ['loggingEnabled', 'Logging'],
  ['tracingEnabled', 'Tracing'],
  ['metricsEnabled', 'Application Metrics'],
] as const

watch(
  [groupSlug, projectSlug],
  async () => {
    const current = ++generation
    project.value = null
    error.value = ''
    saving.value = null
    try {
      const next = await getProject(groupSlug.value, projectSlug.value)
      if (current === generation) project.value = next
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
    <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
    <template v-if="project">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 class="text-2xl font-semibold tracking-tight">{{ project.name }}</h2>
          <p class="mt-1 text-muted-foreground">Vue monitoring project</p>
        </div>
        <Badge :variant="project.connected ? 'default' : 'secondary'">
          {{ project.connected ? 'Connected' : 'Awaiting connection' }}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle class="text-base">Feature settings</CardTitle>
          <CardDescription>Manage data collection and enabled features.</CardDescription>
        </CardHeader>
        <CardContent class="grid gap-3 sm:grid-cols-2">
          <div
            v-for="[key, label] in featureLabels"
            :key="key"
            class="flex items-center justify-between rounded-lg border p-3"
          >
            <span>{{ label }}</span>
            <Badge
              as="button"
              type="button"
              role="switch"
              :aria-label="label"
              :aria-checked="project[key]"
              :aria-busy="saving === key"
              :disabled="saving !== null"
              :variant="project[key] ? 'default' : 'secondary'"
              :title="`${project[key] ? 'Disable' : 'Enable'} ${label}`"
              class="h-8 min-w-24 cursor-pointer px-4 py-1.5 text-sm hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
              @click="toggleFeature(key, label)"
              >{{ saving === key ? 'Saving…' : project[key] ? 'Enabled' : 'Disabled' }}</Badge
            >
          </div>
        </CardContent>
      </Card>
    </template>
  </section>
</template>

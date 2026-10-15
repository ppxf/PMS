<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { buildMetricsUsageSnippet } from '../utils/sdk-setup'

defineProps<{
  metricsEnabled: boolean
  groupSlug: string
  projectSlug: string
  copied: string
}>()
defineEmits<{ copy: [value: string, label: string] }>()
const usage = buildMetricsUsageSnippet()
</script>

<template>
  <p v-if="!metricsEnabled" data-testid="metrics-disabled" class="text-sm text-amber-700">
    Application Metrics is disabled for this project. Enable it in
    <RouterLink
      :to="{ name: 'project-detail', params: { groupSlug, projectSlug } }"
      class="underline"
      >Project settings</RouterLink
    >
    before reporting samples. The SDK also requires enableMetrics: true.
  </p>
  <Card>
    <CardHeader>
      <CardTitle class="text-base">4. Record custom metrics</CardTitle>
      <CardDescription
        >Add this example to a Vue component after initializing the SDK. Replace the names and
        measurements with the values your application needs to monitor.</CardDescription
      >
    </CardHeader>
    <CardContent class="space-y-3">
      <pre
        data-testid="metrics-usage-snippet"
        class="overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-4 text-xs text-slate-100"
        >{{ usage }}</pre>
      <Button
        data-testid="copy-metrics-usage"
        variant="outline"
        @click="$emit('copy', usage, 'metrics example')"
        >Copy metrics example</Button
      >
      <p v-if="copied === 'metrics example'" role="status" class="text-sm text-muted-foreground">
        Copied metrics example
      </p>
      <p class="text-sm text-muted-foreground">
        Metrics are custom application measurements. The example names are not built-in metrics, and
        this setup does not add browser.web_vital metrics.
      </p>
    </CardContent>
  </Card>
</template>

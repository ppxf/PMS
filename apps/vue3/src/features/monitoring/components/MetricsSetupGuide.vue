<script setup lang="ts">
import { translate } from '@/i18n'

import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { buildMetricsUsageSnippet } from '../utils/sdk-setup'

defineProps<{
  metricsEnabled: boolean
  groupSlug: string
  projectSlug: string
}>()
defineEmits<{ copy: [value: string, label: string] }>()
const usage = buildMetricsUsageSnippet()
</script>

<template>
  <p v-if="!metricsEnabled" data-testid="metrics-disabled" class="text-sm text-amber-700">
    {{ translate('Application Metrics is disabled for this project. Enable it in') }}
    <RouterLink
      :to="{ name: 'project-detail', params: { groupSlug, projectSlug } }"
      class="underline"
      >{{ translate('Project settings') }}</RouterLink
    >
    {{ translate('before reporting samples. The SDK also requires enableMetrics: true.') }}
  </p>
  <Card>
    <CardHeader>
      <CardTitle class="text-base">{{ translate('4. Record custom metrics') }}</CardTitle>
      <CardDescription>{{
        translate(
          'Add this example to a Vue component after initializing the SDK. Replace the names and measurements with the values your application needs to monitor.',
        )
      }}</CardDescription>
    </CardHeader>
    <CardContent class="space-y-3">
      <pre data-testid="metrics-usage-snippet" class="code-block" tabindex="0">{{ usage }}</pre>
      <Button
        data-testid="copy-metrics-usage"
        variant="outline"
        @click="$emit('copy', usage, 'metrics example')"
        >{{ translate('Copy metrics example') }}</Button
      >
      <p class="text-sm text-muted-foreground">
        {{
          translate(
            'Metrics includes automatically reported browser performance measurements and custom application measurements. The SDK automatically reports LCP, INP, CLS, FCP and TTFB when supported by the browser. This example adds custom metrics.',
          )
        }}
      </p>
    </CardContent>
  </Card>
</template>

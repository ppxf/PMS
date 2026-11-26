<script setup lang="ts">
import { intlLocale } from '@/i18n'
import { translate } from '@/i18n'

import { formatDateTime } from '@/lib/date-time'
import EmptyState from '@/components/ui/empty-state/EmptyState.vue'
import TablePagination from '@/components/ui/pagination/TablePagination.vue'
import { onBeforeUnmount, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import MetricAttributeTree from './MetricAttributeTree.vue'
import { traceMetrics } from '../api/metrics.api'
import type { TraceMetricsResult } from '../model/metrics'

const props = defineProps<{
  group: string
  project: string
  traceId: string
}>()
const result = ref<TraceMetricsResult>(),
  loading = ref(false),
  error = ref('')
const search = ref(''),
  appliedSearch = ref(''),
  page = ref(1)
let generation = 0
async function load() {
  const current = ++generation
  loading.value = true
  error.value = ''
  result.value = undefined
  try {
    const response = await traceMetrics(props.group, props.project, props.traceId, {
      page: page.value,
      pageSize: 20,
      ...(appliedSearch.value ? { search: appliedSearch.value } : {}),
    })
    if (current === generation) {
      result.value = response
    }
  } catch {
    if (current === generation) error.value = 'Unable to load related metrics'
  } finally {
    if (current === generation) loading.value = false
  }
}
function applySearch() {
  appliedSearch.value = search.value.trim()
  page.value = 1
  void load()
}
function changePage(next: number) {
  page.value = next
  void load()
}
watch(
  [() => props.group, () => props.project, () => props.traceId],
  () => {
    search.value = ''
    appliedSearch.value = ''
    page.value = 1
    void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  generation++
})
</script>

<template>
  <section :aria-label="translate('Related application metrics')" class="space-y-4">
    <form class="flex flex-wrap items-center gap-3" @submit.prevent="applySearch">
      <Input
        v-model="search"
        :aria-label="translate('Search related metrics')"
        :placeholder="translate('Search application metrics in this trace')"
        maxlength="128"
        class="min-w-60 flex-1"
      />
      <Button type="submit" variant="outline" :disabled="loading">{{ translate('Search') }}</Button>
    </form>
    <p v-if="loading" role="status" class="text-sm text-muted-foreground">
      {{ translate('Loading metrics…') }}
    </p>
    <p v-if="error" role="alert">
      {{ translate(error) }}
      <Button variant="outline" @click="load">{{ translate('Retry') }}</Button>
    </p>
    <div class="table-surface">
      <table class="app-table">
        <thead>
          <tr>
            <th class="p-3">{{ translate('Application Metric') }}</th>
            <th class="p-3">{{ translate('Type') }}</th>
            <th class="p-3">{{ translate('Value') }}</th>
            <th class="p-3">{{ translate('Timestamp') }}</th>
            <th class="p-3">{{ translate('Attributes') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="sample in result?.samples" :key="`${sample.eventId}:${sample.sampleIndex}`">
            <td class="p-3">{{ sample.name }}</td>
            <td class="p-3">{{ sample.type }}</td>
            <td class="whitespace-nowrap p-3 tabular-nums">
              {{ sample.value.toLocaleString(intlLocale()) }}
              {{ translate(sample.unit === 'none' ? '' : sample.unit) }}
            </td>
            <td class="whitespace-nowrap p-3">
              {{ formatDateTime(sample.timestamp) }}
            </td>
            <td class="w-96 max-w-96 align-top">
              <details v-if="Object.keys(sample.attributes).length" class="min-w-56">
                <summary class="cursor-pointer rounded text-cyan-700 focus-visible:outline-2">
                  {{ translate('Attributes (') }}{{ Object.keys(sample.attributes).length }})
                </summary>
                <MetricAttributeTree :entries="Object.entries(sample.attributes)" class="mt-3" />
                <p class="mt-3 text-xs text-muted-foreground">
                  {{ translate('Environment:') }} {{ sample.environment ?? '—' }} / Release:
                  {{ sample.release ?? '—' }}
                </p>
              </details>
              <span v-else class="text-muted-foreground">-</span>
            </td>
          </tr>
        </tbody>
      </table>
      <EmptyState
        v-if="!loading && !error && result && !result.samples.length"
        class="p-8"
        :title="translate('No matching related metrics')"
      />
    </div>
    <TablePagination
      v-if="result"
      :page="result.page"
      :total="result.total"
      :page-size="result.pageSize"
      :busy="loading"
      unit="metrics"
      :label="translate('Related metrics pagination')"
      previous-label="Previous metrics page"
      next-label="Next metrics page"
      @change="changePage"
    />
  </section>
</template>

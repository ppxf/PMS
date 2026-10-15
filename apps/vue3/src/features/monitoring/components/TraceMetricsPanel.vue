<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue'
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
  selectedSpanId?: string
}>()
const emit = defineEmits<{ selectSpan: [spanId: string]; loaded: [total: number] }>()
const result = ref<TraceMetricsResult>(),
  loading = ref(false),
  error = ref('')
const search = ref(''),
  appliedSearch = ref(''),
  onlySpan = ref(false),
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
      ...(onlySpan.value && props.selectedSpanId ? { spanId: props.selectedSpanId } : {}),
    })
    if (current === generation) {
      result.value = response
      emit('loaded', response.total)
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
    onlySpan.value = false
    page.value = 1
    void load()
  },
  { immediate: true },
)
watch([onlySpan, () => props.selectedSpanId], () => {
  page.value = 1
  void load()
})
onBeforeUnmount(() => {
  generation++
})
</script>

<template>
  <section aria-label="Related application metrics" class="trace-metrics space-y-4">
    <form class="flex flex-wrap items-center gap-3" @submit.prevent="applySearch">
      <Input
        v-model="search"
        aria-label="Search related metrics"
        placeholder="Search application metrics in this trace"
        maxlength="128"
        class="min-w-60 flex-1"
      />
      <Button type="submit" variant="outline" :disabled="loading">Search</Button>
      <label class="flex items-center gap-2 text-sm">
        <input
          v-model="onlySpan"
          type="checkbox"
          aria-label="Metrics for selected span only"
          :disabled="!selectedSpanId"
        />
        Selected span only
      </label>
    </form>
    <p v-if="loading" role="status" class="text-sm text-muted-foreground">Loading metrics…</p>
    <p v-if="error" role="alert">
      {{ error }} <Button variant="outline" @click="load">Retry</Button>
    </p>
    <div class="overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead>
          <tr>
            <th class="p-3">Application Metric</th>
            <th class="p-3">Type</th>
            <th class="p-3">Value</th>
            <th class="p-3">Timestamp</th>
            <th class="p-3">Span</th>
            <th class="p-3">Attributes</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="sample in result?.samples" :key="`${sample.eventId}:${sample.sampleIndex}`">
            <td class="p-3">{{ sample.name }}</td>
            <td class="p-3">{{ sample.type }}</td>
            <td class="whitespace-nowrap p-3 tabular-nums">
              {{ sample.value.toLocaleString('en-US') }}
              {{ sample.unit === 'none' ? '' : sample.unit }}
            </td>
            <td class="whitespace-nowrap p-3">
              {{ new Date(sample.timestamp).toLocaleString('en-US') }}
            </td>
            <td class="p-3">
              <button
                v-if="sample.spanId"
                type="button"
                :aria-label="`View span ${sample.spanId}`"
                class="font-mono text-cyan-700 underline"
                @click="emit('selectSpan', sample.spanId)"
              >
                {{ sample.spanId }}
              </button>
              <span v-else>—</span>
            </td>
            <td class="w-96 max-w-96 align-top">
              <details v-if="Object.keys(sample.attributes).length" class="min-w-56">
                <summary class="cursor-pointer rounded text-cyan-700 focus-visible:outline-2">
                  Attributes ({{ Object.keys(sample.attributes).length }})
                </summary>
                <MetricAttributeTree :entries="Object.entries(sample.attributes)" class="mt-3" />
                <p class="mt-3 text-xs text-muted-foreground">
                  Environment: {{ sample.environment ?? '—' }} / Release:
                  {{ sample.release ?? '—' }}
                </p>
              </details>
              <span v-else class="text-muted-foreground">-</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="result && !result.samples.length" class="p-8 text-center text-muted-foreground">
        No matching related metrics
      </p>
    </div>
    <div v-if="result" class="flex flex-wrap items-center justify-end gap-3 text-sm">
      <span class="mr-auto text-muted-foreground">{{ result.total }} metrics</span>
      <div class="flex gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Previous metrics page"
          :disabled="loading || result.page <= 1"
          @click="changePage(result.page - 1)"
          ><ChevronLeft aria-hidden="true"
        /></Button>
        <span class="min-w-8 text-center tabular-nums" aria-current="page">{{ result.page }}</span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Next metrics page"
          :disabled="loading || result.page * result.pageSize >= result.total"
          @click="changePage(result.page + 1)"
          ><ChevronRight aria-hidden="true"
        /></Button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.trace-metrics th {
  color: var(--muted-foreground);
  font-weight: 500;
}
.trace-metrics th,
.trace-metrics td {
  padding: 12px 10px;
  border-bottom: 1px solid var(--border);
}
</style>

<script setup lang="ts">
import EmptyState from '@/components/ui/empty-state/EmptyState.vue'
import TablePagination from '@/components/ui/pagination/TablePagination.vue'
import { querySuggestions } from '../model/query-suggestions'
import { Download, Trash2 } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { use } from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { Button } from '@/components/ui/button'
import FormSelect from '@/components/ui/select/FormSelect.vue'
import { metricQuery } from '../api/metrics.api'
import {
  metricCsv,
  metricGroupLabel,
  metricAggregations,
  defaultMetricAggregation,
  metricTypeLabel,
  metricAggregationLabel,
  catalogGroupFields,
  catalogFilterFields,
  buildMetricFilter,
} from '../model/metrics'
import MetricOptionPicker from '../components/MetricOptionPicker.vue'
import QuerySearchBar from './QuerySearchBar.vue'
import MetricAttributeTree from '../components/MetricAttributeTree.vue'
import type {
  MetricAggregation,
  MetricCatalog,
  MetricQuery,
  MetricResult,
  MetricFilterOperator,
} from '../model/metrics'
use([LineChart, BarChart, CanvasRenderer, GridComponent, TooltipComponent, LegendComponent])
const props = defineProps<{
  catalog: MetricCatalog
  range: number
  window: { start: string; end: string }
  initialIndex: number
  label: string
  removable: boolean
}>()
const emit = defineEmits<{ remove: [] }>()
const route = useRoute()
const catalog = computed(() => props.catalog)
const result = ref<MetricResult | null>(null)
const selected = ref(''),
  aggregation = ref<MetricAggregation>('sum'),
  range = computed(() => props.range),
  interval = ref(0)
const groupBy = ref<string[]>([]),
  filterField = ref('environment'),
  filterValue = ref(''),
  filterOperator = ref<MetricFilterOperator>('eq')
const filters = ref<MetricQuery['filters']>([]),
  chartType = ref<'line' | 'bar'>('line'),
  tab = ref('samples')
const loading = ref(false),
  error = ref(''),
  page = ref(1)
const metricKey = (item: { name: string; type: string; unit: string; source?: string }) =>
  JSON.stringify([
    item.name,
    item.type,
    item.unit,
    ...(item.source === 'web_vitals' ? ['web_vitals'] : []),
  ])
const identity = computed(() =>
  catalog.value?.items.find((item) => metricKey(item) === selected.value),
)
const aggregations = computed(() => metricAggregations(identity.value?.type ?? 'count'))
const metricOptions = computed(
  () =>
    catalog.value?.items.map((item) => ({
      key: metricKey(item),
      label: item.source === 'web_vitals' ? item.name.replace(/\.value$/, '') : item.name,
      type: metricTypeLabel(item.type),
      unit: item.unit,
    })) ?? [],
)
const groupOptions = computed(() => catalogGroupFields(catalog.value))
const filterFields = computed(() => catalogFilterFields(catalog.value))
const currentFilterField = computed(() =>
  filterFields.value.find((field) => field.key === filterField.value),
)
const filterOperators = computed(() => currentFilterField.value?.operators ?? ['eq'])
watch(filterField, () => {
  if (!filterOperators.value.includes(filterOperator.value)) filterOperator.value = 'eq'
  filterValue.value = filterOperator.value === 'exists' ? 'true' : ''
})
watch(filterOperator, (value) => {
  filterValue.value = value === 'exists' ? 'true' : ''
})
const groupLabel = computed(() =>
  groupBy.value
    .map((key) => groupOptions.value.find((field) => field.key === key)?.label ?? key)
    .join(' / '),
)
const aggregateUnit = computed(() =>
  aggregation.value === 'count' ? 'none' : (identity.value?.unit ?? 'none'),
)
const chart = computed(() => ({
  animation: false,
  color: ['#0891b2', '#e11d48', '#16a34a', '#d97706', '#7c3aed'],
  tooltip: { trigger: 'axis' },
  legend: { type: 'scroll', bottom: 0 },
  grid: { left: 55, right: 20, top: 20, bottom: 60 },
  xAxis: { type: 'time' },
  yAxis: { type: 'value', name: aggregateUnit.value === 'none' ? '' : aggregateUnit.value },
  series:
    result.value?.series.map((series) => ({
      name: groupBy.value.length
        ? metricGroupLabel(series.groupValue)
        : `${aggregation.value}(${identity.value?.name ?? ''})`,
      type: chartType.value,
      showSymbol: false,
      connectNulls: false,
      data: series.points.map((point) => [point.timestamp, point.value]),
    })) ?? [],
}))
let generation = 0
let appliedWindow: { start: string; end: string } | undefined
function slugs() {
  return [String(route.params.groupSlug), String(route.params.projectSlug)] as const
}
async function load(reset = true) {
  const current = ++generation
  loading.value = true
  error.value = ''
  result.value = null
  if (reset) {
    page.value = 1
    appliedWindow = undefined
  }
  if (interval.value && Math.ceil((range.value * 3600) / interval.value) > 500) interval.value = 0
  try {
    const [group, project] = slugs()
    if (!catalog.value.items.some((item) => metricKey(item) === selected.value)) {
      const first =
        catalog.value.items[props.initialIndex % Math.max(1, catalog.value.items.length)]
      selected.value = first ? metricKey(first) : ''
      aggregation.value =
        first?.source === 'web_vitals' ? 'p75' : defaultMetricAggregation(first?.type ?? 'count')
    }
    const item = identity.value
    if (!item) return
    if (!metricAggregations(item.type).includes(aggregation.value))
      aggregation.value = defaultMetricAggregation(item.type)
    if (!appliedWindow) {
      appliedWindow = { ...props.window }
    }
    const query: MetricQuery = {
      ...(item.source === 'web_vitals' ? { source: 'web_vitals' as const } : {}),
      name: item.name,
      type: item.type,
      unit: item.unit,
      ...appliedWindow,
      aggregation: aggregation.value,
      filters: filters.value.map((f) => ({
        ...f,
        ...(Array.isArray(f.value) ? { value: [...f.value] } : {}),
      })),
      page: page.value,
      pageSize: 20,
      ...(groupBy.value.length ? { groupBy: [...groupBy.value] } : {}),
      ...(interval.value ? { intervalSeconds: interval.value } : {}),
    }
    const next = await metricQuery(group, project, query)
    if (current === generation) result.value = next
  } catch (e) {
    if (current === generation) error.value = e instanceof Error ? e.message : 'Metric query failed'
  } finally {
    if (current === generation) loading.value = false
  }
}
function changeMetric(value: string | string[]) {
  if (typeof value !== 'string') return
  selected.value = value
  aggregation.value =
    identity.value?.source === 'web_vitals'
      ? 'p75'
      : defaultMetricAggregation(identity.value?.type ?? 'count')
  void load()
}
function changeGroups(value: string | string[]) {
  groupBy.value = Array.isArray(value) ? value : []
  void load()
}
async function applyCondition(condition: { field: string; operator: string; value: string }) {
  filterField.value = condition.field
  await nextTick()
  filterOperator.value = condition.operator as MetricFilterOperator
  await nextTick()
  filterValue.value = condition.value
  addFilter()
}
function addFilter() {
  if (!currentFilterField.value || filters.value.length >= 10) return
  try {
    filters.value.push(
      buildMetricFilter(currentFilterField.value, filterOperator.value, filterValue.value),
    )
    filterValue.value = filterOperator.value === 'exists' ? 'true' : ''
    void load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Invalid filter condition'
  }
}
function removeFilter(index: number) {
  filters.value.splice(index, 1)
  void load()
}
function paginate(delta: number) {
  page.value += delta
  void load(false)
}
function exportCsv() {
  if (!result.value) return
  const url = URL.createObjectURL(
    new Blob(['\uFEFF', metricCsv(result.value)], { type: 'text/csv;charset=utf-8' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = 'metrics-samples.csv'
  link.click()
  URL.revokeObjectURL(url)
}
const format = (value: number | null) =>
  value === null ? '-' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value)
watch(
  () => [route.params.groupSlug, route.params.projectSlug],
  () => {
    selected.value = ''
    filters.value = []
    filterField.value = 'environment'
    filterOperator.value = 'eq'
    filterValue.value = ''
    groupBy.value = []
    void load()
  },
  { immediate: true },
)
watch(
  () => [props.window, props.catalog],
  () => {
    void load()
  },
)
onBeforeUnmount(() => {
  generation++
})
</script>

<template>
  <section class="metrics-view min-w-0 space-y-3 rounded-xl border bg-background p-4">
    <header class="flex items-center justify-between gap-3">
      <span
        class="inline-flex size-8 items-center justify-center rounded-md bg-cyan-50 text-sm font-semibold text-cyan-700"
        >{{ label }}</span
      >
      <div class="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Export current sample page"
          :disabled="!result?.samples.length"
          @click="exportCsv"
          ><Download
        /></Button>
        <Button
          v-if="removable"
          variant="ghost"
          size="icon-sm"
          :aria-label="`Remove metric ${label}`"
          @click="emit('remove')"
          ><Trash2
        /></Button>
      </div>
    </header>
    <div class="grid gap-3 md:grid-cols-3">
      <div class="min-w-0">
        <p class="mb-1 text-xs text-muted-foreground">Metric</p>
        <MetricOptionPicker
          :model-value="selected"
          :options="metricOptions"
          label="Metric"
          search-label="Search application metrics"
          title="Application Metrics"
          placeholder="Select a metric"
          @update:model-value="changeMetric"
        />
      </div>
      <label
        >Aggregation<FormSelect
          v-model="aggregation"
          aria-label="Aggregation"
          :options="
            aggregations.map((agg) => ({
              value: agg,
              label: metricAggregationLabel(agg, identity?.type ?? 'count'),
            }))
          "
          @change="load()"
      /></label>
      <div class="min-w-0">
        <p class="mb-1 text-xs text-muted-foreground">Group by</p>
        <MetricOptionPicker
          :model-value="groupBy"
          :options="groupOptions"
          label="Group by"
          search-label="Search group fields"
          multiple
          @update:model-value="changeGroups"
        />
      </div>
    </div>
    <p v-if="identity" class="text-xs text-muted-foreground">
      {{ metricTypeLabel(identity.type) }} ·
      {{
        identity.type === 'count'
          ? 'Counter: sum adds reported increments; count returns the number of samples.'
          : identity.type === 'gauge'
            ? 'Gauge: last returns the latest observation in the selected time range.'
            : 'Distribution: percentiles and averages are calculated from reported samples.'
      }}
    </p>
    <QuerySearchBar
      :fields="filterFields"
      :existence-value="true"
      :suggestions="querySuggestions(filterFields, result?.samples ?? [])"
      :active-field="filterField"
      @select="filterField = $event"
      @condition="applyCondition"
    >
      <template #conditions>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="(filter, index) in filters"
            :key="index"
            type="button"
            class="metric-filter-chip rounded-md border px-3 py-1.5 text-sm"
            :aria-label="`Remove condition ${index + 1}`"
            @click="removeFilter(index)"
          >
            {{ filter.field }} {{ filter.operator }}
            {{ filter.value === undefined ? '' : JSON.stringify(filter.value) }} ×
          </button>
        </div>
      </template>
    </QuerySearchBar>
    <p v-if="error" role="alert" class="flex items-center gap-3 text-sm text-destructive">
      {{ error }} <Button variant="outline" size="sm" @click="load(false)">Retry</Button>
    </p>
    <div class="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
      <span
        >{{ result?.total ?? 0 }} samples<span v-if="result?.truncatedGroups">
          · Showing the 20 groups with the most samples</span
        ><span v-if="catalog?.truncated"> · Metric catalog truncated</span></span
      >
      <div class="flex gap-2">
        <FormSelect
          v-model="chartType"
          aria-label="Chart type"
          class="w-24"
          :options="[
            { value: 'line', label: 'Line' },
            { value: 'bar', label: 'Bar' },
          ]"
        />
        <FormSelect
          v-model="interval"
          aria-label="Interval"
          class="w-36"
          :options="[
            { value: 0, label: 'Auto interval' },
            { value: 60, label: '1 minute', disabled: range > 6 },
            { value: 300, label: '5 minutes', disabled: range > 24 },
            { value: 3600, label: '1 hour' },
            { value: 86400, label: '1 day' },
          ]"
          @change="load()"
        />
      </div>
    </div>
    <div class="grid min-w-0 gap-4 xl:grid-cols-2">
      <div
        class="flex h-96 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-background"
        :aria-busy="loading"
      >
        <div
          class="flex shrink-0 items-center justify-between gap-2 border-b bg-muted/40 px-4 py-3 text-sm"
        >
          <span class="font-medium">Metric trend</span>
          <span class="truncate text-xs text-muted-foreground"
            >{{ aggregation }} · {{ aggregateUnit === 'none' ? 'Unitless' : aggregateUnit }}</span
          >
        </div>
        <div class="relative min-h-0 flex-1 p-3">
          <p
            v-if="loading"
            role="status"
            class="grid h-full place-items-center text-sm text-muted-foreground"
          >
            Loading…
          </p>
          <VChart v-else-if="result?.total" :option="chart" autoresize class="h-full w-full" />
          <p v-else-if="error" class="grid h-full place-items-center text-sm text-muted-foreground">
            Query not completed
          </p>
          <EmptyState v-else class="h-full" title="No metric samples in this time range" />
        </div>
      </div>
      <div
        class="flex h-96 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-background"
      >
        <nav class="flex shrink-0 gap-1 overflow-x-auto border-b" aria-label="Metric data views">
          <button
            v-for="item in [
              { id: 'samples', label: 'Samples' },
              { id: 'aggregates', label: 'Aggregates' },
            ]"
            :key="item.id"
            type="button"
            class="monitoring-tab"
            :aria-pressed="tab === item.id"
            @click="tab = item.id"
          >
            {{ item.label }}
          </button>
        </nav>
        <div class="flex min-h-0 flex-1 flex-col overflow-auto">
          <table v-if="tab === 'samples'" class="app-table">
            <thead class="sticky top-0 z-10">
              <tr>
                <th>Trace ID</th>
                <th>Value ({{ identity?.unit ?? 'none' }})</th>
                <th>Timestamp</th>
                <th>Environment</th>
                <th>Attributes</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="sample in result?.samples"
                :key="`${sample.eventId}:${sample.sampleIndex}`"
              >
                <td>
                  <RouterLink
                    v-if="sample.traceId"
                    :to="{
                      name: 'project-trace-detail',
                      params: {
                        groupSlug: route.params.groupSlug,
                        projectSlug: route.params.projectSlug,
                        traceId: sample.traceId,
                      },
                      query: {
                        tab: 'metrics',
                        ...(sample.spanId ? { spanId: sample.spanId } : {}),
                      },
                    }"
                    class="font-mono text-cyan-700 underline"
                    >{{ sample.traceId }}</RouterLink
                  ><span v-else>-</span>
                </td>
                <td class="tabular-nums">{{ format(sample.value) }}</td>
                <td class="whitespace-nowrap">
                  {{ new Date(sample.timestamp).toLocaleString('en-US') }}
                </td>
                <td>{{ sample.environment ?? '-' }}</td>
                <td class="w-96 max-w-96 align-top">
                  <details v-if="Object.keys(sample.attributes).length" class="min-w-56">
                    <summary class="cursor-pointer rounded text-cyan-700 focus-visible:outline-2">
                      Attributes ({{ Object.keys(sample.attributes).length }})
                    </summary>
                    <MetricAttributeTree
                      :entries="Object.entries(sample.attributes)"
                      class="mt-3"
                    />
                  </details>
                  <span v-else class="text-muted-foreground">-</span>
                </td>
              </tr>
            </tbody>
          </table>
          <table v-else class="app-table">
            <thead class="sticky top-0 z-10">
              <tr>
                <th>{{ groupLabel || 'Group' }}</th>
                <th>
                  {{ metricAggregationLabel(aggregation, identity?.type ?? 'count') }} ({{
                    aggregateUnit
                  }})
                </th>
                <th>Samples</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in result?.aggregates" :key="index">
                <td>{{ metricGroupLabel(row.groupValue) }}</td>
                <td>{{ format(row.value) }}</td>
                <td>{{ row.sampleCount }}</td>
              </tr>
            </tbody>
          </table>
          <EmptyState
            v-if="
              !loading &&
              !error &&
              !(tab === 'samples' ? result?.samples.length : result?.aggregates.length)
            "
            class="flex-1 px-4 py-8"
            :title="tab === 'samples' ? 'No samples to display' : 'No aggregates to display'"
          />
        </div>
        <TablePagination
          v-if="tab === 'samples'"
          class="shrink-0 border-t px-4 py-2"
          :page="page"
          :total="result?.total ?? 0"
          :page-size="20"
          :busy="loading"
          unit="samples"
          label="Metric samples pagination"
          @change="paginate($event - page)"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.metric-filter-panel .filter-field,
.metric-filter-panel .filter-operator,
.metric-filter-panel .filter-value {
  max-width: 100%;
}
.metric-filter-panel .filter-field {
  width: 296px;
}
.metric-filter-panel .filter-operator {
  width: 106px;
}
.metric-filter-panel .filter-value {
  width: 184px;
}
.metric-filter-chip {
  background: var(--muted);
  color: var(--muted-foreground);
  max-width: 100%;
  overflow-wrap: anywhere;
}
.metrics-view label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  color: var(--muted-foreground);
  min-width: 0;
}
</style>

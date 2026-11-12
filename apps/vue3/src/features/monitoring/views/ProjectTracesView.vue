<script setup lang="ts">
import EmptyState from '@/components/ui/empty-state/EmptyState.vue'
import TablePagination from '@/components/ui/pagination/TablePagination.vue'
import { querySuggestions } from '../model/query-suggestions'
import QuerySearchBar from '../components/QuerySearchBar.vue'
import { ArrowDown, ArrowUp, ArrowUpDown } from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { use } from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { Button } from '@/components/ui/button'
import Loading from '@/components/ui/loading/Loading.vue'
import FormSelect from '@/components/ui/select/FormSelect.vue'
import {
  spanSamples,
  traceSamples,
  traceSeries,
  traceAggregates,
  traceFields,
} from '../api/traces.api'
import { formatMetric, metricUnit, metricFields, groupFields, presetQuery } from '../model/traces'
import type {
  TraceQuery,
  TraceField,
  TraceFilter,
  TraceMetric,
  Span,
  TraceSample,
  TraceSeries,
  TraceAggregates,
} from '../model/traces'
use([LineChart, BarChart, CanvasRenderer, GridComponent, TooltipComponent, LegendComponent])
const route = useRoute()
const group = computed(() => String(route.params.groupSlug)),
  project = computed(() => String(route.params.projectSlug))
const preset = ref('pages')
const metrics = ref<TraceMetric[]>(presetQuery('pages').metrics),
  filters = ref<TraceFilter[]>(presetQuery('pages').filters),
  groups = ref(presetQuery('pages').groupBy)
const primaryMetric = ref(0),
  limit = ref(5)
let nextChartId = 0
function createChart() {
  const now = Date.now()
  return {
    id: nextChartId++,
    start: now - 3600000,
    end: now,
    timeRange: '1h',
    type: 'line' as 'line' | 'bar',
    interval: 'auto' as NonNullable<TraceQuery['interval']>,
    result: null as TraceSeries | null,
    loading: false,
    error: false,
    generation: 0,
  }
}
type MetricChart = ReturnType<typeof createChart>
const chartSettings = ref(metrics.value.map(createChart))
const timeRanges = [
  { value: '1h', label: 'Last hour', duration: 3600000 },
  { value: '6h', label: 'Last 6 hours', duration: 6 * 3600000 },
  { value: '24h', label: 'Last 24 hours', duration: 24 * 3600000 },
  { value: '3d', label: 'Last 3 days', duration: 3 * 86400000 },
  { value: '7d', label: 'Last 7 days', duration: 7 * 86400000 },
  { value: '14d', label: 'Last 14 days', duration: 14 * 86400000 },
  { value: '30d', label: 'Last 30 days', duration: 30 * 86400000 },
]
const intervals: {
  value: NonNullable<TraceQuery['interval']>
  label: string
  duration?: number
}[] = [
  { value: 'auto', label: 'Auto' },
  { value: '1m', label: '1 minute', duration: 60000 },
  { value: '30m', label: '30 minutes', duration: 1800000 },
  { value: '1h', label: '1 hour', duration: 3600000 },
  { value: '3h', label: '3 hours', duration: 10800000 },
  { value: '6h', label: '6 hours', duration: 21600000 },
  { value: '1d', label: '1 day', duration: 86400000 },
]
function intervalDisabled(chart: MetricChart, value: TraceQuery['interval']) {
  const duration = intervals.find((item) => item.value === value)?.duration
  return duration != null && Math.ceil((chart.end - chart.start) / duration) > 500
}
function applyTimeRange(chart: MetricChart, index: number) {
  const selected = timeRanges.find((range) => range.value === chart.timeRange)
  if (!selected) return
  const now = Date.now()
  chart.start = now - selected.duration
  chart.end = now
  refreshChart(chart, index)
}
const fields = ref<TraceField[]>([]),
  loading = ref(false),
  error = ref(''),
  page = ref(1),
  tab = ref('Span Samples')
const sortBy = ref('startTime'),
  direction = ref<'asc' | 'desc'>('desc')
const spans = ref<Span[]>([]),
  traces = ref<TraceSample[]>([]),
  total = ref(0)
const aggregates = ref<TraceAggregates | null>(null)
const seriesMetrics = ref<TraceMetric[]>(metrics.value.map((m) => ({ ...m })))
const filterField = ref('span.op')
const availableGroups = computed(() =>
  fields.value.length ? fields.value.filter((f) => f.groupable).map((f) => f.name) : groupFields,
)
const addingGroup = ref(false)
function selectGroup(index: number, value: string) {
  if (index === groups.value.length) addingGroup.value = false
  groups.value[index] = value
}
function removeGroup(index: number) {
  if (index === groups.value.length) addingGroup.value = false
  else groups.value.splice(index, 1)
}
const availableFilters = computed(() =>
  fields.value.length
    ? fields.value.filter((f) => f.operators.length > 0).map((f) => f.name)
    : [...groupFields, ...metricFields, 'span.status', 'span.truncated', 'page.route'],
)
const filterOperators = computed(
  () =>
    fields.value.find((f) => f.name === filterField.value)?.operators ?? [
      'eq',
      'in',
      'not_in',
      'contains',
      'exists',
      'gt',
      'gte',
      'lt',
      'lte',
    ],
)
const tabs = ['Span Samples', 'Trace Samples', 'Aggregates']
function query(chart = chartSettings.value[primaryMetric.value]!): TraceQuery {
  const s = new Date(chart.start),
    e = new Date(chart.end)
  if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime()) || s >= e)
    throw new Error('Select a valid time range')
  return {
    start: s.toISOString(),
    end: e.toISOString(),
    filters: [...filters.value],
    metrics: metrics.value.map((m) => ({ ...m })),
    groupBy: [...groups.value],
    primaryMetric: primaryMetric.value,
    limit: limit.value,
    interval: chart.interval,
    page: page.value,
    pageSize: 20,
    sortBy: tab.value === 'Aggregates' ? Number(sortBy.value) || 0 : sortBy.value,
    sortDirection: direction.value,
  }
}
const resultsTable = ref<HTMLDivElement | null>(null)
const resultsHeight = ref(0)
let generation = 0
async function load() {
  if (!loading.value) resultsHeight.value = resultsTable.value?.offsetHeight ?? 0
  const current = ++generation
  loading.value = true
  error.value = ''
  try {
    const q = query()
    const sampleQuery = { ...q, sortBy: tab.value === 'Aggregates' ? 'startTime' : q.sortBy }
    const result = await Promise.all([
      traceAggregates(group.value, project.value, {
        ...q,
        sortBy: tab.value === 'Aggregates' ? q.sortBy : primaryMetric.value,
      }),
      tab.value === 'Trace Samples'
        ? traceSamples(group.value, project.value, sampleQuery)
        : spanSamples(group.value, project.value, sampleQuery),
    ])
    if (current !== generation) return
    seriesMetrics.value = q.metrics
    aggregates.value = result[0]
    total.value = result[1].total
    if (tab.value === 'Trace Samples') traces.value = result[1].items as TraceSample[]
    else spans.value = result[1].items as Span[]
  } catch (cause) {
    if (current === generation)
      error.value =
        cause instanceof Error && cause.message === 'Select a valid time range'
          ? cause.message
          : 'Unable to load traces. Please try again.'
  } finally {
    if (current === generation) loading.value = false
  }
}
async function loadChart(chart: MetricChart, index: number) {
  const current = ++chart.generation
  chart.loading = true
  chart.error = false
  chart.result = null
  try {
    const q = query(chart)
    const result = await traceSeries(group.value, project.value, {
      ...q,
      metrics: [q.metrics[index]!],
      primaryMetric: 0,
      sortBy: 'startTime',
      page: 1,
    })
    if (current === chart.generation) chart.result = result
  } catch {
    if (current === chart.generation) chart.error = true
  } finally {
    if (current === chart.generation) chart.loading = false
  }
}
function refreshChart(chart: MetricChart, index: number) {
  if (intervalDisabled(chart, chart.interval)) chart.interval = 'auto'
  void loadChart(chart, index)
  if (index === primaryMetric.value) apply()
}
function loadCharts() {
  chartSettings.value.forEach((chart, index) => void loadChart(chart, index))
}
function apply() {
  page.value = 1
  void load()
}
function sortColumn(column: string) {
  direction.value = sortBy.value === column && direction.value === 'desc' ? 'asc' : 'desc'
  sortBy.value = column
  apply()
}
function columnSort(column: string): 'ascending' | 'descending' | 'none' {
  return sortBy.value === column ? (direction.value === 'asc' ? 'ascending' : 'descending') : 'none'
}
function sortIcon(column: string) {
  return sortBy.value === column ? (direction.value === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
}
function addMetric() {
  metrics.value.push({ function: 'avg', field: 'span.duration' })
  chartSettings.value.push(createChart())
}
function removeMetric(index: number) {
  metrics.value.splice(index, 1)
  chartSettings.value.splice(index, 1)
  if (index === primaryMetric.value) primaryMetric.value = 0
  else if (index < primaryMetric.value) primaryMetric.value--
}
function changePage(offset: number) {
  page.value += offset
  void load()
}
function applyPreset() {
  const q = presetQuery(preset.value)
  filters.value = q.filters
  metrics.value = q.metrics
  chartSettings.value = q.metrics.map(createChart)
  groups.value = q.groupBy
  addingGroup.value = false
  primaryMetric.value = 0
}
function applyCondition(condition: { field: string; operator: string; value: string }) {
  filterField.value = condition.field
  const operator = condition.operator as TraceFilter['operator']
  const field = fields.value.find((f) => f.name === condition.field)
  const parse = (v: string): unknown =>
    field?.type === 'number' ||
    metricFields.includes(condition.field) ||
    condition.field === 'http.status_code'
      ? Number(v)
      : field?.type === 'boolean' ||
          condition.field === 'is_transaction' ||
          condition.field === 'span.truncated'
        ? v === 'true'
        : v
  const value =
    operator === 'in' || operator === 'not_in'
      ? condition.value.split(',').map((v) => parse(v.trim()))
      : parse(condition.value.trim())
  filters.value.push({
    field: condition.field,
    operator,
    ...(operator === 'exists' ? {} : { value }),
  })
}
function changeFunction(metric: TraceMetric) {
  if (metric.function === 'count' || metric.function === 'errorRate') metric.field = 'spans'
  else if (metric.field === 'spans') metric.field = 'span.duration'
}
function chartOptions(metric: TraceMetric, chart: MetricChart) {
  const { start, end } = chart
  const timeLabel = new Intl.DateTimeFormat(
    'en-US',
    end - start <= 86400000
      ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
      : { month: 'short', day: 'numeric' },
  )
  const unit = metricUnit(metric)
  const numberLabel = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
  const formatValue = (value: number) =>
    unit === 'ms' && value >= 1000
      ? `${numberLabel.format(value / 1000)}s`
      : `${numberLabel.format(value)}${unit === 'spans' ? '' : unit === 'byte' ? ' B' : unit}`
  return {
    animation: false,
    grid: { left: 80, right: 80, top: 70, bottom: 30 },
    legend: { type: 'scroll', top: 0 },
    tooltip: {
      trigger: 'axis',
      renderMode: 'richText',
      formatter: (input: unknown) => {
        const points = (Array.isArray(input) ? input : [input]) as {
          seriesName?: string
          data?: { value?: [string, number | null]; sampleCount?: number }
        }[]
        return points
          .map(
            (p) =>
              `${p.seriesName ?? ''}: ${p.data?.value?.[1] == null ? '—' : formatValue(p.data.value[1])} (n=${p.data?.sampleCount ?? 0})`,
          )
          .join('\n')
      },
    },
    xAxis: {
      type: 'time',
      min: start,
      max: end,
      axisLabel: {
        formatter: (timestamp: number) => timeLabel.format(timestamp),
        hideOverlap: true,
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      minInterval: unit === 'spans' || unit === 'byte' ? 1 : undefined,
      axisLabel: { formatter: (value: number) => (value === 0 ? '0' : formatValue(value)) },
    },
    series: (chart.result?.series ?? []).map((s) => {
      const group = chart.result?.groups.find((g) => g.key === s.groupKey)
      return {
        type: chart.type,
        smooth: false,
        connectNulls: false,
        showSymbol: chart.type === 'line',
        name: `${group?.values.map((v) => (v == null ? 'Unknown' : JSON.stringify(v))).join(' / ') || 'All'} · ${metric.function}(${metric.field})`,
        data: s.points.map((p) => ({
          value: [
            p.timestamp,
            p.value == null ? null : metric.function === 'errorRate' ? p.value * 100 : p.value,
          ],
          sampleCount: p.sampleCount,
        })),
        tooltip: {
          valueFormatter: (v: unknown) => (typeof v !== 'number' ? '—' : formatValue(v)),
        },
      }
    }),
  }
}
const charts = computed(() =>
  metrics.value.map((metric, index) => ({
    title: `${metric.function}(${metric.field})`,
    settings: chartSettings.value[index]!,
    option: chartOptions(metric, chartSettings.value[index]!),
  })),
)
function detailLink(traceId: string) {
  return {
    name: 'project-trace-detail',
    params: { groupSlug: group.value, projectSlug: project.value, traceId },
    query: { highlight: JSON.stringify(filters.value) },
  }
}
watch([filters, metrics, groups, limit], loadCharts, { deep: true })
watch(
  groups,
  () => {
    tab.value = groups.value.length ? 'Aggregates' : 'Span Samples'
  },
  { deep: true, flush: 'sync' },
)
watch(
  [tab, filters, metrics, groups, primaryMetric, limit],
  ([currentTab], [previousTab]) => {
    if (currentTab !== previousTab) {
      sortBy.value = currentTab === 'Aggregates' ? '0' : 'startTime'
      direction.value = 'desc'
    }
    apply()
  },
  { deep: true },
)
watch([group, project], () => {
  loadCharts()
  page.value = 1
  void load()
})
onMounted(async () => {
  try {
    fields.value = await traceFields(group.value, project.value)
  } catch {
    /* Backend still independently validates all queries. */
  }
  loadCharts()
  void load()
})
</script>

<template>
  <section class="traces-page space-y-6">
    <div>
      <h2 class="page-title">Traces</h2>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <label class="flex flex-col gap-2">
        <span>Quick query</span>
        <FormSelect
          v-model="preset"
          class="control"
          @change="applyPreset"
          aria-label="Quick query"
          :options="[
            { value: 'pages', label: 'Page performance' },
            { value: 'slow', label: 'Slow requests (fetch)' },
            { value: 'requests', label: 'Request volume (fetch)' },
            { value: 'statuses', label: 'Status distribution (fetch)' },
            { value: 'ttfb', label: 'Time to first byte (fetch)' },
            { value: 'sizes', label: 'Large responses (fetch)' },
            {
              value: 'versions',
              label: 'Release regression (pageload; filter by the same span.name)',
            },
            { value: 'all', label: 'All spans' },
          ]"
      /></label>
    </div>
    <QuerySearchBar
      :fields="
        availableFilters.map((key) => ({
          key,
          type: fields.find((field) => field.name === key)?.type,
          operators: fields.find((field) => field.name === key)?.operators ?? filterOperators,
        }))
      "
      :active-field="filterField"
      :suggestions="
        querySuggestions(
          availableFilters.map((key) => ({ key })),
          spans,
        )
      "
      @select="filterField = $event"
      @condition="applyCondition"
    >
      <template #conditions>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="(f, i) in filters"
            :key="i"
            class="filter-chip rounded-md border px-3 py-1.5 text-sm"
            :aria-label="`Remove condition ${f.field}`"
            @click="filters.splice(i, 1)"
          >
            {{ f.field }} {{ f.operator }} {{ f.value }} ×
          </button>
        </div>
      </template>
    </QuerySearchBar>
    <div class="grid items-stretch gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside class="visualize-panel space-y-5 rounded-xl border p-5">
        <h3 class="font-semibold">Visualize</h3>
        <div v-for="(metric, i) in metrics" :key="i" class="space-y-3 border-b pb-4">
          <label class="flex items-center gap-2"
            ><input v-model="primaryMetric" type="radio" :value="i" />Primary metric
            {{ i + 1 }}</label
          >
          <FormSelect
            v-model="metric.function"
            :aria-label="`Aggregation function ${i + 1}`"
            class="control w-full"
            @change="changeFunction(metric)"
            :options="
              (['count', 'avg', 'p50', 'p75', 'p95', 'errorRate'] as const).map((value) => ({
                value,
                label: value,
              }))
            "
          />
          <FormSelect
            v-model="metric.field"
            :aria-label="`Metric field ${i + 1}`"
            class="control w-full"
            :disabled="metric.function === 'count' || metric.function === 'errorRate'"
            :options="
              (metric.function === 'count' || metric.function === 'errorRate'
                ? ['spans']
                : fields.length
                  ? fields
                      .filter((field) => field.aggregations.includes(metric.function))
                      .map((field) => field.name)
                  : metricFields
              ).map((value) => ({ value, label: value }))
            "
          />
          <Button v-if="metrics.length > 1" variant="outline" @click="removeMetric(i)"
            >Remove metric</Button
          >
        </div>
        <Button v-if="metrics.length < 5" variant="outline" @click="addMetric"
          >Add metric series</Button
        >
        <h3 class="font-semibold">Group by</h3>
        <div
          v-for="i in groups.length + Number(addingGroup)"
          :key="i"
          class="space-y-3 border-b pb-4"
        >
          <FormSelect
            :model-value="groups[i - 1]"
            :aria-label="`Group by ${i}`"
            class="control w-full"
            placeholder="Select a field"
            :options="
              availableGroups.map((value) => ({
                value,
                label: value,
                disabled: groups.includes(value) && groups[i - 1] !== value,
              }))
            "
            @change="selectGroup(i - 1, $event)"
          />
          <Button variant="outline" :aria-label="`Remove group ${i}`" @click="removeGroup(i - 1)">
            Remove group
          </Button>
        </div>
        <Button
          v-if="!addingGroup"
          variant="outline"
          :disabled="!availableGroups.some((value) => !groups.includes(value))"
          @click="addingGroup = true"
        >
          Add group
        </Button>
        <h3 class="font-semibold">Top</h3>
        <FormSelect
          v-model="limit"
          class="control w-full"
          aria-label="Top limit"
          :options="[5, 6, 7, 8, 9, 10].map((value) => ({ value, label: String(value) }))"
        />
      </aside>
      <div class="min-w-0 space-y-3">
        <section
          v-for="(chart, index) in charts"
          :key="chart.settings.id"
          class="chart-panel min-w-0 rounded-xl border p-5"
        >
          <header class="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
            <h3 class="break-words text-sm font-semibold">{{ chart.title }}</h3>
            <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Chart settings">
              <FormSelect
                v-model="chart.settings.timeRange"
                class="control w-48 max-sm:grow"
                :aria-label="index === 0 ? 'Time range' : `Time range for chart ${index + 1}`"
                @change="applyTimeRange(chart.settings, index)"
                :options="timeRanges"
              />
              <FormSelect
                v-model="chart.settings.type"
                class="control w-30 max-sm:grow"
                :aria-label="index === 0 ? 'Chart type' : `Chart type for chart ${index + 1}`"
                :options="[
                  { value: 'line', label: 'Line' },
                  { value: 'bar', label: 'Bar' },
                ]"
              />
              <FormSelect
                v-model="chart.settings.interval"
                class="control w-32 max-sm:grow"
                :aria-label="index === 0 ? 'Interval' : `Interval for chart ${index + 1}`"
                @change="refreshChart(chart.settings, index)"
                :options="
                  intervals.map((item) => ({
                    ...item,
                    disabled: intervalDisabled(chart.settings, item.value),
                  }))
                "
              />
            </div>
          </header>
          <div class="relative">
            <VChart
              :option="chart.option"
              :update-options="{ replaceMerge: ['series'] }"
              class="chart"
              autoresize
            />
            <EmptyState
              v-if="chart.settings.result?.sampleCount === 0"
              class="pointer-events-none absolute inset-0"
              title="No chart data in this time range"
            />
          </div>
          <Loading v-if="chart.settings.loading" class="mb-2" label="Loading chart…" />
          <p
            v-else-if="chart.settings.error"
            role="alert"
            class="mb-2 text-sm text-muted-foreground"
          >
            Unable to load chart.
            <Button variant="outline" @click="loadChart(chart.settings, index)">Retry</Button>
          </p>
          <p class="text-sm text-muted-foreground">
            Matched {{ chart.settings.result?.sampleCount ?? 0 }} sampled records. Times use your
            local time zone.
          </p>
        </section>
      </div>
    </div>
    <div v-if="error" role="alert" class="text-destructive">
      {{ error }} <Button variant="outline" @click="load">Retry</Button>
    </div>
    <nav class="flex gap-1 overflow-x-auto border-b" aria-label="Trace result views">
      <button
        v-for="t in tabs"
        :key="t"
        type="button"
        :aria-pressed="tab === t"
        class="monitoring-tab"
        @click="tab = t"
      >
        {{ t }}
      </button>
    </nav>
    <div
      ref="resultsTable"
      class="table-surface"
      :style="loading ? { minHeight: `${resultsHeight}px` } : undefined"
    >
      <table class="app-table" :aria-busy="loading">
        <thead v-if="tab === 'Span Samples'">
          <tr>
            <th>Span</th>
            <th>Type</th>
            <th>Root operation</th>
            <th :aria-sort="columnSort('startTime')">
              <button
                class="sort-header"
                aria-label="Sort by time"
                @click="sortColumn('startTime')"
              >
                Time <component :is="sortIcon('startTime')" class="sort-icon" aria-hidden="true" />
              </button>
            </th>
            <th :aria-sort="columnSort('durationMs')">
              <button
                class="sort-header"
                aria-label="Sort by duration"
                @click="sortColumn('durationMs')"
              >
                Duration
                <component :is="sortIcon('durationMs')" class="sort-icon" aria-hidden="true" />
              </button>
            </th>
            <th>Status / completeness</th>
          </tr>
        </thead>
        <thead v-else-if="tab === 'Trace Samples'">
          <tr>
            <th>Trace</th>
            <th :aria-sort="columnSort('startTime')">
              <button
                class="sort-header"
                aria-label="Sort by start time"
                @click="sortColumn('startTime')"
              >
                Start time
                <component :is="sortIcon('startTime')" class="sort-icon" aria-hidden="true" />
              </button>
            </th>
            <th :aria-sort="columnSort('durationMs')">
              <button
                class="sort-header"
                aria-label="Sort by span duration"
                @click="sortColumn('durationMs')"
              >
                Span duration
                <component :is="sortIcon('durationMs')" class="sort-icon" aria-hidden="true" />
              </button>
            </th>
            <th>Retained spans</th>
            <th>Completeness</th>
          </tr>
        </thead>
        <thead v-else>
          <tr>
            <th>Group by</th>
            <th v-for="(m, i) in seriesMetrics" :key="i" :aria-sort="columnSort(String(i))">
              <button
                class="sort-header"
                :aria-label="`Sort by ${m.function}(${m.field})`"
                @click="sortColumn(String(i))"
              >
                {{ m.function }}({{ m.field }})
                <component :is="sortIcon(String(i))" class="sort-icon" aria-hidden="true" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading || (tab === 'Aggregates' ? !aggregates?.items.length : !total)">
            <td
              :colspan="
                tab === 'Span Samples' ? 6 : tab === 'Trace Samples' ? 5 : seriesMetrics.length + 1
              "
              class="result-placeholder text-muted-foreground"
            >
              <Loading v-if="loading" label="Loading results…" />
              <EmptyState v-else-if="!error" title="No data" />
            </td>
          </tr>
          <template v-else-if="tab === 'Span Samples'">
            <tr v-for="s in spans" :key="s.spanId">
              <td>
                <RouterLink class="text-primary hover:underline" :to="detailLink(s.traceId)">{{
                  s.name
                }}</RouterLink>
              </td>
              <td>{{ s.op }}</td>
              <td>{{ s.isTransaction }}</td>
              <td>{{ new Date(s.startTime).toLocaleString('en-US') }}</td>
              <td>{{ s.durationMs }} ms</td>
              <td>{{ s.status }} {{ s.truncated ? 'Truncated' : '' }}</td>
            </tr>
          </template>
          <template v-else-if="tab === 'Trace Samples'">
            <tr v-for="t in traces" :key="t.traceId">
              <td>
                <RouterLink class="text-primary hover:underline" :to="detailLink(t.traceId)">{{
                  t.traceId
                }}</RouterLink>
              </td>
              <td>{{ new Date(t.startTime).toLocaleString('en-US') }}</td>
              <td>{{ t.durationMs }} ms</td>
              <td>{{ t.spanCount }}</td>
              <td>{{ t.truncated ? 'Truncated' : 'Retained records' }}</td>
            </tr>
          </template>
          <template v-else>
            <tr v-for="a in aggregates?.items" :key="a.groupKey">
              <td>{{ a.groupValues.map((v) => v ?? 'Unknown').join(' / ') || 'All' }}</td>
              <td v-for="(m, i) in seriesMetrics" :key="i">
                {{ formatMetric(a.values[i], m) }}
                <span class="text-muted-foreground">(n={{ a.sampleCounts[i] ?? 0 }})</span>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <TablePagination
      v-if="tab !== 'Aggregates'"
      :page="page"
      :total="total"
      :page-size="20"
      :busy="loading"
      label="Trace results pagination"
      @change="changePage($event - page)"
    />
  </section>
</template>
<style scoped>
.control {
  max-width: 100%;
}
.sort-header:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 3px;
}
label {
  font-size: 0.875rem;
}
.visualize-panel,
.filter-panel,
.chart-panel {
  background: var(--background);
}
.chart {
  min-height: 360px;
  height: 360px;
}
.result-placeholder {
  height: 5.5rem;
  text-align: center;
}
tbody tr:hover {
  background: color-mix(in srgb, var(--muted) 45%, transparent);
}
.sort-header {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  cursor: pointer;
  transition: color 0.15s;
}
.sort-header:hover,
th[aria-sort='ascending'],
th[aria-sort='descending'] {
  color: var(--foreground);
}
.sort-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}
th[aria-sort='none'] .sort-icon {
  opacity: 0.4;
}
.filter-chip {
  background: var(--muted);
  color: var(--muted-foreground);
}
@media (max-width: 640px) {
  .chart {
    min-height: 300px;
    height: 300px;
  }
}
</style>

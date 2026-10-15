<script setup lang="ts">
import {
  ChevronLeft,
  ChevronRight,
  Logs,
  Search,
  RefreshCw,
  Download,
  Plus,
  X,
  ChevronDown,
  ArrowDown,
  ArrowUp,
  Columns3,
  Code,
} from '@lucide/vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent } from 'reka-ui'
import { useRoute } from 'vue-router'
import { use } from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import FormSelect from '@/components/ui/select/FormSelect.vue'
import { controlStyles, menuStyles } from '@/components/ui/control-styles'
import { logFields, logQuery } from '../api/logs.api'
import { LOG_LEVELS, logsCsv } from '../model/logs'
import type { LogFields, LogLevel, LogQuery, LogResult } from '../model/logs'
use([BarChart, LineChart, CanvasRenderer, GridComponent, TooltipComponent, LegendComponent])
const route = useRoute()
const fields = ref<LogFields | null>(null),
  result = ref<LogResult | null>(null)
const search = ref(''),
  range = ref(24),
  environment = ref(''),
  traceId = ref('')
const levels = ref<LogLevel[]>([]),
  filters = ref<LogQuery['filters']>([])
const filterKey = ref(''),
  filterValue = ref(''),
  filterType = ref('string')
const loading = ref(false),
  error = ref(''),
  page = ref(1),
  sortDirection = ref<'asc' | 'desc'>('desc')
const chartType = ref<'bar' | 'line'>('bar'),
  interval = ref(0),
  autoRefresh = ref(false)
const expanded = ref<string | null>(null)
const showEnvironment = ref(true),
  showTrace = ref(true),
  showAttributes = ref(false)
const colors: Record<LogLevel, string> = {
  trace: '#64748b',
  debug: '#0891b2',
  info: '#2563eb',
  warn: '#d97706',
  error: '#e11d48',
  fatal: '#7c3aed',
}
const chart = computed(() => ({
  animation: false,
  tooltip: { trigger: 'axis' },
  legend: { bottom: 0, type: 'scroll' },
  grid: { left: 45, right: 16, top: 16, bottom: 50 },
  xAxis: { type: 'time' },
  yAxis: { type: 'value', minInterval: 1 },
  series:
    result.value?.series.map((series) => ({
      name: series.level,
      type: chartType.value,
      stack: chartType.value === 'bar' ? 'logs' : undefined,
      showSymbol: false,
      itemStyle: { color: colors[series.level] },
      data: series.points.map((point) => [point.timestamp, point.count]),
    })) ?? [],
}))
const snippet = computed(
  () =>
    `import * as PMS from '@pms/monitoring-vue'\n\nPMS.init({ app, dsn: ${JSON.stringify(fields.value?.dsn ?? 'YOUR_PROJECT_DSN')}, enableLogs: true })\nPMS.logger.info('Checkout completed', { orderId: 'order-123', amount: 99 })\nPMS.logger.warn('Payment retry', { attempt: 2 })\nawait PMS.flush()`,
)
let generation = 0,
  window: { start: string; end: string } | undefined
let refreshTimer: ReturnType<typeof setInterval> | undefined
async function load(reset = true) {
  const current = ++generation
  loading.value = true
  error.value = ''
  result.value = null
  expanded.value = null
  if (reset) {
    page.value = 1
    window = undefined
  }
  if (interval.value && Math.ceil((range.value * 3600) / interval.value) > 500) interval.value = 0
  try {
    const group = String(route.params.groupSlug),
      project = String(route.params.projectSlug)
    if (!fields.value) {
      const next = await logFields(group, project)
      if (current !== generation) return
      fields.value = next
    }
    if (traceId.value && !/^[a-f0-9]{32}$/.test(traceId.value))
      throw new Error('Trace ID must contain 32 lowercase hexadecimal characters')
    if (!window) {
      const now = Date.now()
      window = {
        start: new Date(now - range.value * 3600000).toISOString(),
        end: new Date(now).toISOString(),
      }
    }
    const query: LogQuery = {
      ...window,
      levels: [...levels.value],
      filters: filters.value.map((f) => ({ ...f })),
      page: page.value,
      pageSize: 20,
      sortDirection: sortDirection.value,
      ...(search.value ? { search: search.value } : {}),
      ...(environment.value ? { environment: environment.value } : {}),
      ...(traceId.value ? { traceId: traceId.value } : {}),
      ...(interval.value ? { intervalSeconds: interval.value } : {}),
    }
    const next = await logQuery(group, project, query)
    if (current === generation) result.value = next
  } catch (e) {
    if (current === generation) error.value = e instanceof Error ? e.message : 'Log query failed'
  } finally {
    if (current === generation) loading.value = false
  }
}
function refresh() {
  fields.value = null
  void load()
}
function addFilter() {
  if (!filterKey.value || filters.value.length >= 10) return
  const value =
    filterType.value === 'number'
      ? Number(filterValue.value)
      : filterType.value === 'boolean'
        ? filterValue.value === 'true'
        : filterValue.value
  if (typeof value === 'number' && (!filterValue.value.trim() || !Number.isFinite(value))) {
    error.value = 'Enter a valid number'
    return
  }
  filters.value.push({ key: filterKey.value, value })
  filterValue.value = ''
  void load()
}
function removeFilter(index: number) {
  filters.value.splice(index, 1)
  void load()
}
function changeFilterType() {
  filterValue.value = filterType.value === 'boolean' ? 'true' : ''
}
function paginate(delta: number) {
  page.value += delta
  void load(false)
}
function sort() {
  sortDirection.value = sortDirection.value === 'desc' ? 'asc' : 'desc'
  void load()
}
function exportCsv() {
  if (!result.value) return
  const url = URL.createObjectURL(
    new Blob(['\uFEFF', logsCsv(result.value.items)], { type: 'text/csv;charset=utf-8' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = 'logs.csv'
  link.click()
  URL.revokeObjectURL(url)
}
watch(autoRefresh, (enabled) => {
  if (refreshTimer) clearInterval(refreshTimer)
  refreshTimer = enabled
    ? setInterval(() => {
        if (!loading.value && document.visibilityState !== 'hidden') void load()
      }, 15000)
    : undefined
})
watch(
  () => [route.params.groupSlug, route.params.projectSlug],
  () => {
    fields.value = null
    search.value = ''
    environment.value = ''
    traceId.value = ''
    levels.value = []
    filters.value = []
    void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  generation++
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
  <section class="logs-view min-w-0 space-y-4">
    <header class="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
      <div class="flex min-w-0 items-center gap-2">
        <Logs class="size-5 shrink-0 text-cyan-600" />
        <h2 class="text-xl font-semibold">Logs</h2>
        <span class="truncate text-sm text-muted-foreground">{{ route.params.projectSlug }}</span>
      </div>
      <div class="flex items-center gap-2">
        <FormSelect
          v-model="range"
          aria-label="Time range"
          @change="load()"
          :options="[
            { value: 1, label: 'Last hour' },
            { value: 6, label: 'Last 6 hours' },
            { value: 24, label: 'Last 24 hours' },
            { value: 72, label: 'Last 3 days' },
            { value: 168, label: 'Last 7 days' },
          ]"
        /><Button
          variant="outline"
          size="icon"
          title="Refresh"
          aria-label="Refresh"
          :disabled="loading"
          @click="refresh"
          ><RefreshCw class="size-4" /></Button
        ><Button
          variant="outline"
          size="icon"
          title="Export current log page"
          aria-label="Export current log page"
          :disabled="!result?.items.length"
          @click="exportCsv"
          ><Download class="size-4"
        /></Button>
      </div>
    </header>
    <p v-if="fields && !fields.enabled" class="text-sm text-amber-700">
      Log ingestion is disabled for this project.
      <RouterLink :to="{ name: 'project-detail', params: route.params }" class="underline"
        >Project settings</RouterLink
      >
    </p>
    <form class="flex gap-2" @submit.prevent="load()">
      <Input
        v-model="search"
        type="search"
        aria-label="Search logs"
        placeholder="Search log messages"
        maxlength="256"
        class="min-w-0 flex-1"
      /><Button type="submit" size="icon" variant="outline" title="Search" aria-label="Search"
        ><Search class="size-4"
      /></Button>
    </form>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label
        v-for="level in LOG_LEVELS"
        :key="level"
        class="inline-flex items-center gap-1.5 text-sm"
        ><input
          v-model="levels"
          type="checkbox"
          :value="level"
          :aria-label="`Level ${level}`"
          @change="load()"
        /><span class="h-2 w-2 rounded-full" :style="{ backgroundColor: colors[level] }" />{{
          level
        }}</label
      >
    </div>
    <div class="grid gap-3 sm:grid-cols-2">
      <label
        >Environment<Input
          v-model="environment"
          aria-label="Environment"
          placeholder="All environments"
          maxlength="128"
          @change="load()" /></label
      ><label
        >Trace ID<Input
          v-model="traceId"
          aria-label="Trace ID"
          placeholder="All traces"
          maxlength="32"
          @change="load()"
      /></label>
    </div>
    <form class="flex flex-wrap items-end gap-2" @submit.prevent="addFilter">
      <label
        >Attributes<FormSelect
          v-model="filterKey"
          aria-label="Filter attribute"
          :options="[
            { value: '', label: 'Select an attribute' },
            ...(fields?.attributes ?? []).map((value) => ({ value, label: value })),
          ]" /></label
      ><label
        >Value type<FormSelect
          v-model="filterType"
          aria-label="Filter value type"
          @change="changeFilterType"
          :options="[
            { value: 'string', label: 'Text' },
            { value: 'number', label: 'Number' },
            { value: 'boolean', label: 'Boolean' },
          ]" /></label
      ><label
        >Equals<FormSelect
          v-if="filterType === 'boolean'"
          v-model="filterValue"
          aria-label="Filter value"
          :options="[
            { value: 'true', label: 'true' },
            { value: 'false', label: 'false' },
          ]" /><Input
          v-else
          v-model="filterValue"
          aria-label="Filter value"
          :type="filterType === 'number' ? 'number' : 'text'"
          step="any"
          maxlength="256" /></label
      ><Button
        type="submit"
        size="icon"
        variant="outline"
        title="Add filter"
        aria-label="Add filter"
        :disabled="!filterKey || filters.length >= 10"
        ><Plus class="size-4" /></Button
      ><span
        v-for="(filter, index) in filters"
        :key="index"
        class="flex max-w-full items-center gap-1 text-sm"
        ><span class="break-all">{{ filter.key }} = {{ JSON.stringify(filter.value) }}</span
        ><button
          type="button"
          :aria-label="`Remove filter ${filter.key}`"
          title="Remove filter"
          @click="removeFilter(index)"
        >
          <X class="size-4" /></button
      ></span>
    </form>
    <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
    <div class="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
      <span>{{ result?.total ?? 0 }} logs</span>
      <div class="flex gap-2">
        <FormSelect
          v-model="chartType"
          aria-label="Chart type"
          :options="[
            { value: 'bar', label: 'Bar' },
            { value: 'line', label: 'Line' },
          ]"
        /><FormSelect
          v-model="interval"
          aria-label="Interval"
          @change="load()"
          :options="[
            { value: 0, label: 'Auto interval' },
            { value: 60, label: '1 minute', disabled: range > 6 },
            { value: 300, label: '5 minutes', disabled: range > 24 },
            { value: 3600, label: '1 hour' },
            { value: 86400, label: '1 day' },
          ]"
        />
      </div>
    </div>
    <div class="h-56 min-w-0 overflow-hidden border-b" :aria-busy="loading">
      <p
        v-if="loading"
        role="status"
        class="grid h-full place-items-center text-sm text-muted-foreground"
      >
        Loading…
      </p>
      <VChart v-else-if="result?.total" :option="chart" autoresize class="h-full w-full" />
      <p v-else class="grid h-full place-items-center text-sm text-muted-foreground">
        {{ error ? 'Query not completed' : 'No logs in this time range' }}
      </p>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <label class="inline-flex items-center gap-2 text-sm"
        ><input v-model="autoRefresh" type="checkbox" aria-label="Auto refresh" />Auto
        refresh</label
      >
      <PopoverRoot>
        <PopoverTrigger as-child>
          <button
            type="button"
            aria-label="Columns"
            class="flex cursor-pointer items-center gap-1"
            :class="controlStyles"
          >
            <Columns3 class="size-4" />Columns
          </button>
        </PopoverTrigger>
        <PopoverPortal>
          <PopoverContent
            aria-label="Columns"
            align="end"
            :side-offset="4"
            class="flex min-w-40 max-w-[calc(100vw-2rem)] flex-col gap-2 p-3 text-sm"
            :class="menuStyles"
          >
            <label class="flex items-center gap-2"
              ><input
                v-model="showEnvironment"
                type="checkbox"
                aria-label="Show environment"
              />Environment</label
            ><label class="flex items-center gap-2"
              ><input v-model="showTrace" type="checkbox" aria-label="Show trace ID" />Trace
              ID</label
            ><label class="flex items-center gap-2"
              ><input
                v-model="showAttributes"
                type="checkbox"
                aria-label="Show attributes"
              />Attributes</label
            >
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full table-fixed text-left text-sm">
        <thead>
          <tr>
            <th class="w-44" :aria-sort="sortDirection === 'desc' ? 'descending' : 'ascending'">
              <button class="flex items-center gap-1" aria-label="Sort by time" @click="sort">
                Timestamp<ArrowDown v-if="sortDirection === 'desc'" class="size-3" /><ArrowUp
                  v-else
                  class="size-3"
                />
              </button>
            </th>
            <th class="w-20">Level</th>
            <th class="w-80">Message</th>
            <th v-if="showEnvironment" class="w-36">Environment</th>
            <th v-if="showTrace" class="w-72">Trace ID</th>
            <th v-if="showAttributes" class="w-64">Attributes</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="log in result?.items" :key="log.logId"
            ><tr>
              <td class="whitespace-nowrap">
                {{ new Date(log.timestamp).toLocaleString('en-US') }}
              </td>
              <td>
                <span class="font-medium" :style="{ color: colors[log.level] }">{{
                  log.level
                }}</span>
              </td>
              <td>
                <button
                  class="flex w-full items-start gap-1 text-left"
                  :aria-label="`View log ${log.logId}`"
                  :aria-expanded="expanded === log.logId"
                  @click="expanded = expanded === log.logId ? null : log.logId"
                >
                  <ChevronDown
                    v-if="expanded === log.logId"
                    class="mt-0.5 size-4 shrink-0"
                  /><ChevronRight v-else class="mt-0.5 size-4 shrink-0" /><span
                    class="line-clamp-2 break-all"
                    >{{ log.message }}</span
                  >
                </button>
              </td>
              <td v-if="showEnvironment" class="break-all">{{ log.environment ?? '-' }}</td>
              <td v-if="showTrace">
                <RouterLink
                  v-if="log.traceId"
                  :to="{
                    name: 'project-trace-detail',
                    params: {
                      groupSlug: route.params.groupSlug,
                      projectSlug: route.params.projectSlug,
                      traceId: log.traceId,
                    },
                  }"
                  class="break-all font-mono text-cyan-700 underline"
                  >{{ log.traceId }}</RouterLink
                ><span v-else>-</span>
              </td>
              <td v-if="showAttributes" class="break-all">{{ JSON.stringify(log.attributes) }}</td>
            </tr>
            <tr v-if="expanded === log.logId">
              <td
                :colspan="3 + Number(showEnvironment) + Number(showTrace) + Number(showAttributes)"
                class="bg-muted/20"
              >
                <dl class="grid gap-2">
                  <dt class="font-medium">Message</dt>
                  <dd class="whitespace-pre-wrap break-all">{{ log.message }}</dd>
                  <dt class="font-medium">Attributes</dt>
                  <dd>
                    <pre class="whitespace-pre-wrap break-all">{{
                      JSON.stringify(log.attributes, null, 2)
                    }}</pre>
                  </dd>
                  <dt class="font-medium">Log ID / Release / Span ID</dt>
                  <dd class="break-all font-mono text-xs">
                    {{ log.logId }} / {{ log.release ?? '-' }} / {{ log.spanId ?? '-' }}
                  </dd>
                </dl>
              </td>
            </tr></template
          >
        </tbody>
      </table>
    </div>
    <p
      v-if="!loading && !error && result?.total === 0"
      class="py-6 text-center text-sm text-muted-foreground"
    >
      No matching logs
    </p>
    <footer class="flex items-center justify-end gap-3 text-sm">
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Previous page"
        :disabled="loading || page <= 1"
        @click="paginate(-1)"
        ><ChevronLeft aria-hidden="true" /></Button
      ><span class="min-w-8 text-center tabular-nums" aria-current="page">{{ page }}</span
      ><Button
        variant="outline"
        size="icon-sm"
        aria-label="Next page"
        :disabled="loading || !result || page * 20 >= result.total"
        @click="paginate(1)"
        ><ChevronRight aria-hidden="true"
      /></Button>
    </footer>
    <details class="border-t pt-3">
      <summary class="flex cursor-pointer items-center gap-2 text-sm">
        <Code class="size-4" />SDK setup
      </summary>
      <pre class="mt-3 overflow-x-auto bg-muted/30 p-3 text-xs"><code>{{ snippet }}</code></pre>
    </details>
  </section>
</template>

<style scoped>
.logs-view label:has([role='combobox']),
.logs-view label:has(input:not([type='checkbox'])) {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  color: var(--muted-foreground);
  min-width: 0;
}
.logs-view th {
  color: var(--muted-foreground);
  font-weight: 500;
}
.logs-view th,
.logs-view td {
  padding: 12px 10px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}
</style>

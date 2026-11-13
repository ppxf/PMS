<script setup lang="ts">
import { useProjectAccessStore } from "../model/project-access.store"
const projectAccess = useProjectAccessStore()
import EmptyState from '@/components/ui/empty-state/EmptyState.vue'
import TablePagination from '@/components/ui/pagination/TablePagination.vue'
import { querySuggestions } from '../model/query-suggestions'
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Download,
  ChevronDown,
  ArrowDown,
  ArrowUp,
  Columns3,
  Code,
} from '@lucide/vue'
import { onBeforeUnmount, ref, watch } from 'vue'
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent } from 'reka-ui'
import { useRoute } from 'vue-router'
import { use } from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { Button } from '@/components/ui/button'
import FormSelect from '@/components/ui/select/FormSelect.vue'
import { controlStyles, menuStyles } from '@/components/ui/control-styles'
import { logFields, logQuery } from '../api/logs.api'
import { LOG_AGGREGATES, logsCsv, logVisualizationTitle } from '../model/logs'
import LogConditionBuilder from './LogConditionBuilder.vue'
import LogFieldPicker from './LogFieldPicker.vue'
import type {
  LogCondition,
  LogEntry,
  LogField,
  LogVisualization,
  LogFields,
  LogLevel,
  LogQuery,
  LogResult,
} from '../model/logs'
use([BarChart, LineChart, CanvasRenderer, GridComponent, TooltipComponent, LegendComponent])
const route = useRoute()
const fields = ref<LogFields | null>(null),
  result = ref<LogResult | null>(null)
const range = ref(24)
const conditions = ref<LogCondition[]>([])
type Visualization = LogVisualization & {
  groupBy: string[]
  conditions: LogCondition[]
  addingGroup?: boolean
}
const visualizations = ref<Visualization[]>([
  { aggregate: 'count', field: 'logs', groupBy: [], conditions: [] },
])
const activeTab = ref('logs'),
  collapsed = ref(false)
const availableFields: LogField[] = [
  'client.address',
  'message',
  'origin',
  'payload_size',
  'project',
  'sdk.name',
  'sdk.version',
  'severity',
  'timestamp',
  'trace',
  'user_agent.original',
  'browser.name',
  'browser.version',
  'log_source',
].map((key) => ({ key, type: key === 'payload_size' ? 'number' : 'string', category: 'Logs' }))
function aggregateFields(v: Visualization) {
  if (v.aggregate === 'count') return [{ key: 'logs', type: 'logs', category: 'Logs' }]
  if (v.aggregate === 'count_unique') return availableFields
  return availableFields.filter((field) => field.key === 'payload_size')
}
function changeAggregate(v: Visualization) {
  if (!aggregateFields(v).some((f) => f.key === v.field)) v.field = aggregateFields(v)[0]?.key ?? ''
  if (v.field) void load()
}
function removeChart(index: number) {
  const hadGroups = visualizations.value[index]?.groupBy.length
  visualizations.value.splice(index, 1)
  if (hadGroups) applyGroups()
  else void load()
}
function applyGroups() {
  activeTab.value = visualizations.value.some((v) => v.groupBy.length) ? 'aggregates' : 'logs'
  void load()
}
function selectGroup(v: Visualization, index: number, field: string) {
  if (index === v.groupBy.length) v.addingGroup = false
  v.groupBy[index] = field
  applyGroups()
}
function removeGroup(v: Visualization, index: number) {
  if (index === v.groupBy.length) {
    v.addingGroup = false
    return
  }
  v.groupBy.splice(index, 1)
  applyGroups()
}
function addChart() {
  if (visualizations.value.length >= 3) return
  visualizations.value.push({ aggregate: 'count', field: 'logs', groupBy: [], conditions: [] })
  void load()
}
function addDetailCondition(key: string, value: string | number | boolean, exclude = false) {
  if (conditions.value.length >= 10) {
    error.value = 'Maximum 10 conditions'
    return
  }
  conditions.value.push({ key, operator: exclude ? 'neq' : 'eq', value })
  void load()
}
function detailFields(log: LogEntry) {
  return [
    { key: 'payload_size', value: log.payloadSize },
    { key: 'logId', value: log.logId },
    { key: 'timestamp', value: log.timestamp },
    { key: 'severity', value: log.level },
    { key: 'environment', value: log.environment },
    { key: 'release', value: log.release },
    { key: 'trace', value: log.traceId },
    { key: 'spanId', value: log.spanId },
    ...Object.entries(log.attributes).map(([key, value]) => ({ key: `attributes.${key}`, value })),
  ].filter(
    (entry): entry is { key: string; value: string | number | boolean } =>
      entry.value !== undefined && entry.value !== null,
  )
}
async function copyJson(log: LogEntry) {
  try {
    await navigator.clipboard.writeText(JSON.stringify(log, null, 2))
  } catch {
    error.value = 'Could not copy log. Check clipboard permissions.'
  }
}
const loading = ref(false),
  error = ref(''),
  page = ref(1),
  sortDirection = ref<'asc' | 'desc'>('desc')
const chartType = ref<'bar' | 'line'>('bar'),
  interval = ref(0),
  autoRefresh = ref(false)
const expanded = ref<string | null>(null)
const showEnvironment = ref(false),
  showTrace = ref(false),
  showAttributes = ref(false)
const colors: Record<LogLevel, string> = {
  trace: '#64748b',
  debug: '#0891b2',
  info: '#2563eb',
  warn: '#d97706',
  error: '#e11d48',
  fatal: '#7c3aed',
}
function chartOption(index: number) {
  return {
    animation: false,
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, type: 'scroll' },
    grid: { left: 50, right: 16, top: 16, bottom: 50 },
    xAxis: { type: 'time' },
    yAxis: {
      type: 'value',
      minInterval: visualizations.value[index]?.aggregate.startsWith('count') ? 1 : undefined,
    },
    series:
      result.value?.charts?.[index]?.groups.map((group) => ({
        name: group.name,
        type: chartType.value,
        connectNulls: true,
        showSymbol: chartType.value === 'line',
        showAllSymbol: true,
        symbolSize: 6,
        data: group.points.map((p) => [p.timestamp, p.value]),
      })) ?? [],
  }
}
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
    if (!window) {
      const now = Date.now()
      window = {
        start: new Date(now - range.value * 3600000).toISOString(),
        end: new Date(now).toISOString(),
      }
    }
    const query: LogQuery = {
      ...window,
      levels: [],
      filters: [],
      conditions: conditions.value.map((c) => ({ ...c })),
      visualizations: visualizations.value.map((v) => ({
        aggregate: v.aggregate,
        field: v.field,
        groupBy: [...v.groupBy],
        conditions: v.conditions.map((c) => ({ ...c })),
      })),
      page: page.value,
      pageSize: 20,
      sortDirection: sortDirection.value,
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
    conditions.value = []
    visualizations.value = [{ aggregate: 'count', field: 'logs', groupBy: [], conditions: [] }]
    activeTab.value = 'logs'
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
      <h2 class="page-title">Logs</h2>
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
      <RouterLink v-if="projectAccess.canRoute('project-detail')" :to="{ name: 'project-detail', params: route.params }" class="underline"
        >Project settings</RouterLink
      >
    </p>
    <LogConditionBuilder
      v-model="conditions"
      :fields="availableFields"
      :suggestions="querySuggestions(availableFields, result?.items ?? [])"
      label="Log filters"
      @change="load()"
    />
    <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
    <div class="flex min-w-0 flex-col gap-4 lg:flex-row">
      <aside
        class="shrink-0 space-y-4 rounded-lg border bg-card p-3"
        :class="collapsed ? 'lg:w-12' : 'lg:w-72'"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          :aria-label="
            collapsed ? 'Expand visualization controls' : 'Collapse visualization controls'
          "
          @click="collapsed = !collapsed"
          ><ChevronRight v-if="collapsed" class="size-4" /><ChevronLeft v-else class="size-4"
        /></Button>
        <template v-if="!collapsed">
          <div v-for="(v, index) in visualizations" :key="index" class="space-y-3 border-b pb-4">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">
                Visualize {{ visualizations.length > 1 ? index + 1 : '' }}
              </h3>
              <Button
                v-if="visualizations.length > 1"
                variant="outline"
                :aria-label="`Remove chart ${index + 1}`"
                @click="removeChart(index)"
                >Remove</Button
              >
            </div>
            <FormSelect
              v-model="v.aggregate"
              :aria-label="`Aggregate ${index + 1}`"
              :options="LOG_AGGREGATES.map((value) => ({ value, label: value.replace('_', ' ') }))"
              @change="changeAggregate(v)"
            />
            <LogFieldPicker
              v-model="v.field"
              :fields="aggregateFields(v)"
              :label="`Chart field ${index + 1}`"
              @change="load()"
            />
            <details>
              <summary class="cursor-pointer text-xs text-muted-foreground">
                Filter logs for this series
              </summary>
              <div class="mt-3">
                <LogConditionBuilder
                  v-model="v.conditions"
                  compact
                  :fields="availableFields"
                  :suggestions="querySuggestions(availableFields, result?.items ?? [])"
                  :label="`Series ${index + 1}`"
                  @change="load()"
                />
              </div>
            </details>
          </div>
          <Button v-if="visualizations.length < 3" variant="outline" @click="addChart"
            >Add chart</Button
          >
          <section aria-label="Group by" class="space-y-5">
            <h3 class="font-semibold">Group by</h3>
            <div v-for="(v, index) in visualizations" :key="index" class="space-y-3">
              <h4 v-if="visualizations.length > 1" class="text-xs text-muted-foreground">
                Chart {{ index + 1 }}
              </h4>
              <div
                v-for="i in v.groupBy.length + Number(Boolean(v.addingGroup))"
                :key="i"
                class="space-y-3 border-b pb-4"
              >
                <FormSelect
                  :model-value="v.groupBy[i - 1]"
                  :aria-label="`Group ${index + 1}.${i}`"
                  placeholder="Select a field"
                  :options="
                    availableFields.map(({ key }) => ({
                      value: key,
                      label: key,
                      disabled: v.groupBy.includes(key) && v.groupBy[i - 1] !== key,
                    }))
                  "
                  @change="selectGroup(v, i - 1, $event)"
                />
                <Button
                  variant="outline"
                  :aria-label="`Remove group ${index + 1}.${i}`"
                  @click="removeGroup(v, i - 1)"
                  >Remove group</Button
                >
              </div>
              <Button
                v-if="!v.addingGroup"
                variant="outline"
                :disabled="!availableFields.some(({ key }) => !v.groupBy.includes(key))"
                @click="v.addingGroup = true"
                >Add group</Button
              >
              <p v-if="v.groupBy.length" class="text-xs text-muted-foreground">
                Showing up to 20 groups by log count.
              </p>
            </div>
          </section>
        </template>
      </aside>
      <main class="min-w-0 flex-1 space-y-4">
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
        <div
          v-for="(v, index) in visualizations"
          :key="index"
          class="overflow-hidden rounded-lg border bg-card"
          :aria-busy="loading"
        >
          <h3 class="px-4 pt-3 text-sm font-semibold">
            {{ logVisualizationTitle(v) }}
          </h3>
          <div class="h-52 min-w-0">
            <p
              v-if="loading"
              role="status"
              class="grid h-full place-items-center text-sm text-muted-foreground"
            >
              Loading...
            </p>
            <VChart
              v-else-if="result?.charts?.[index]?.groups.length"
              :option="chartOption(index)"
              autoresize
              class="h-full w-full"
            />
            <p
              v-else-if="error"
              class="grid h-full place-items-center text-sm text-muted-foreground"
            >
              Query not completed
            </p>
            <EmptyState v-else class="h-full" title="No logs match this series" />
          </div>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3 border-b">
          <div class="flex gap-1 overflow-x-auto" role="tablist" aria-label="Log results">
            <button
              v-for="tab in ['logs', 'aggregates']"
              :key="tab"
              type="button"
              role="tab"
              :aria-selected="activeTab === tab"
              class="monitoring-tab capitalize"
              @click="activeTab = tab"
            >
              {{ tab }}
            </button>
          </div>
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
        <div v-if="activeTab === 'aggregates'" class="table-surface">
          <table class="app-table">
            <thead>
              <tr>
                <th>Chart</th>
                <th>Group</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="(chart, index) in result?.charts" :key="index"
                ><tr v-for="group in chart.groups" :key="group.name">
                  <td>
                    {{
                      visualizations[index]
                        ? logVisualizationTitle(visualizations[index])
                        : chart.title
                    }}
                  </td>
                  <td>{{ group.name }}</td>
                  <td class="font-mono">{{ group.value ?? '-' }}</td>
                </tr></template
              >
            </tbody>
          </table>
          <EmptyState
            v-if="!loading && !error && !result?.charts?.some((c) => c.groups.length)"
            class="p-6"
            title="No aggregate results"
          />
        </div>
        <div v-else class="table-surface">
          <table
            class="app-table table-fixed"
            :style="{
              minWidth: `${560 + (showEnvironment ? 144 : 0) + (showTrace ? 288 : 0) + (showAttributes ? 256 : 0)}px`,
            }"
          >
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
                <th>Message</th>
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
                    <span
                      class="inline-flex items-center gap-1.5 font-medium"
                      :style="{ color: colors[log.level] }"
                      ><span
                        class="size-2 shrink-0 rounded-full"
                        :style="{ backgroundColor: colors[log.level] }"
                      />{{ log.level }}</span
                    >
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
                  <td v-if="showAttributes" class="break-all">
                    {{ JSON.stringify(log.attributes) }}
                  </td>
                </tr>
                <tr v-if="expanded === log.logId">
                  <td
                    :colspan="
                      3 + Number(showEnvironment) + Number(showTrace) + Number(showAttributes)
                    "
                    class="bg-muted/20"
                  >
                    <div class="space-y-3 rounded-lg border bg-card p-4">
                      <p class="whitespace-pre-wrap break-all border-b pb-3 font-mono text-xs">
                        {{ log.message }}
                      </p>
                      <dl class="grid gap-x-6 gap-y-1 md:grid-cols-2">
                        <div
                          v-for="entry in detailFields(log)"
                          :key="entry.key"
                          class="flex min-w-0 items-start gap-2 rounded bg-muted/40 px-2 py-1 font-mono text-xs"
                        >
                          <dt class="w-32 max-w-[40%] shrink-0 break-all text-muted-foreground">
                            {{ entry.key }}
                          </dt>
                          <dd
                            class="min-w-0 flex-1 whitespace-pre-wrap break-all"
                            :style="
                              entry.key === 'severity' ? { color: colors[log.level] } : undefined
                            "
                          >
                            {{ entry.value }}
                          </dd>
                          <div class="flex shrink-0 gap-1">
                            <button
                              type="button"
                              :aria-label="`Add ${entry.key} to filter`"
                              title="Add to filter"
                              class="rounded px-1 hover:bg-accent"
                              @click="addDetailCondition(entry.key, entry.value)"
                            >
                              +
                            </button>
                            <button
                              type="button"
                              :aria-label="`Exclude ${entry.key} from filter`"
                              title="Exclude from filter"
                              class="rounded px-1 hover:bg-accent"
                              @click="addDetailCondition(entry.key, entry.value, true)"
                            >
                              -
                            </button>
                          </div>
                        </div>
                      </dl>
                      <div class="flex justify-end border-t pt-2">
                        <Button variant="ghost" size="sm" @click="copyJson(log)"
                          ><Code class="size-3" />Copy as JSON</Button
                        >
                      </div>
                    </div>
                  </td>
                </tr></template
              >
            </tbody>
          </table>
        </div>
        <EmptyState
          v-if="activeTab === 'logs' && !loading && !error && result?.total === 0"
          class="py-6"
          title="No matching logs"
        />
        <TablePagination
          v-if="activeTab === 'logs'"
          :page="page"
          :total="result?.total ?? 0"
          :page-size="20"
          :busy="loading"
          unit="logs"
          label="Logs pagination"
          @change="paginate($event - page)"
        />
      </main>
    </div>
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
</style>

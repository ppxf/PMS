<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { use } from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import {
  Logs,
  Search,
  RefreshCw,
  Download,
  Plus,
  X,
  ChevronDown,
  ChevronRight,
  ArrowDown,
  ArrowUp,
  Columns3,
  Code,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
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
      throw new Error('Trace ID 必须为 32 位小写十六进制字符')
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
    if (current === generation) error.value = e instanceof Error ? e.message : '日志查询失败'
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
    error.value = '请输入有效数值'
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
        <select v-model.number="range" aria-label="时间范围" @change="load()">
          <option :value="1">最近 1 小时</option>
          <option :value="6">最近 6 小时</option>
          <option :value="24">最近 24 小时</option>
          <option :value="72">最近 3 天</option>
          <option :value="168">最近 7 天</option></select
        ><Button
          variant="outline"
          size="icon"
          title="刷新"
          aria-label="刷新"
          :disabled="loading"
          @click="refresh"
          ><RefreshCw class="size-4" /></Button
        ><Button
          variant="outline"
          size="icon"
          title="导出当前页日志"
          aria-label="导出当前页日志"
          :disabled="!result?.items.length"
          @click="exportCsv"
          ><Download class="size-4"
        /></Button>
      </div>
    </header>
    <p v-if="fields && !fields.enabled" class="text-sm text-amber-700">
      此项目的 Logs 上报已关闭。<RouterLink
        :to="{ name: 'project-detail', params: route.params }"
        class="underline"
        >项目配置</RouterLink
      >
    </p>
    <form class="flex gap-2" @submit.prevent="load()">
      <input
        v-model="search"
        type="search"
        aria-label="搜索日志"
        placeholder="搜索日志消息"
        maxlength="256"
        class="min-w-0 flex-1"
      /><Button type="submit" size="icon" variant="outline" title="搜索" aria-label="搜索"
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
          :aria-label="`级别 ${level}`"
          @change="load()"
        /><span class="h-2 w-2 rounded-full" :style="{ backgroundColor: colors[level] }" />{{
          level
        }}</label
      >
    </div>
    <div class="grid gap-3 sm:grid-cols-2">
      <label
        >环境<input
          v-model="environment"
          aria-label="环境"
          placeholder="全部环境"
          maxlength="128"
          @change="load()" /></label
      ><label
        >Trace ID<input
          v-model="traceId"
          aria-label="Trace ID"
          placeholder="全部 Trace"
          maxlength="32"
          @change="load()"
      /></label>
    </div>
    <form class="flex flex-wrap items-end gap-2" @submit.prevent="addFilter">
      <label
        >属性<select v-model="filterKey" aria-label="过滤属性">
          <option value="">选择属性</option>
          <option v-for="key in fields?.attributes" :key="key">{{ key }}</option>
        </select></label
      ><label
        >值类型<select v-model="filterType" aria-label="过滤值类型" @change="changeFilterType">
          <option value="string">文本</option>
          <option value="number">数字</option>
          <option value="boolean">布尔值</option>
        </select></label
      ><label
        >等于<select v-if="filterType === 'boolean'" v-model="filterValue" aria-label="过滤值">
          <option value="true">true</option>
          <option value="false">false</option></select
        ><input
          v-else
          v-model="filterValue"
          aria-label="过滤值"
          :type="filterType === 'number' ? 'number' : 'text'"
          step="any"
          maxlength="256" /></label
      ><Button
        type="submit"
        size="icon"
        variant="outline"
        title="添加过滤"
        aria-label="添加过滤"
        :disabled="!filterKey || filters.length >= 10"
        ><Plus class="size-4" /></Button
      ><span
        v-for="(filter, index) in filters"
        :key="index"
        class="flex max-w-full items-center gap-1 text-sm"
        ><span class="break-all">{{ filter.key }} = {{ JSON.stringify(filter.value) }}</span
        ><button
          type="button"
          :aria-label="`移除过滤 ${filter.key}`"
          title="移除过滤"
          @click="removeFilter(index)"
        >
          <X class="size-4" /></button
      ></span>
    </form>
    <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
    <div class="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
      <span>{{ result?.total ?? 0 }} 条日志</span>
      <div class="flex gap-2">
        <select v-model="chartType" aria-label="图表类型">
          <option value="bar">柱状图</option>
          <option value="line">折线图</option></select
        ><select v-model.number="interval" aria-label="时间粒度" @change="load()">
          <option :value="0">自动粒度</option>
          <option :value="60" :disabled="range > 6">1 分钟</option>
          <option :value="300" :disabled="range > 24">5 分钟</option>
          <option :value="3600">1 小时</option>
          <option :value="86400">1 天</option>
        </select>
      </div>
    </div>
    <div class="h-56 min-w-0 overflow-hidden border-b" :aria-busy="loading">
      <p
        v-if="loading"
        role="status"
        class="grid h-full place-items-center text-sm text-muted-foreground"
      >
        加载中…
      </p>
      <VChart v-else-if="result?.total" :option="chart" autoresize class="h-full w-full" />
      <p v-else class="grid h-full place-items-center text-sm text-muted-foreground">
        {{ error ? '查询未完成' : '此时间范围内没有日志' }}
      </p>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <label class="inline-flex items-center gap-2 text-sm"
        ><input v-model="autoRefresh" type="checkbox" aria-label="自动刷新" />自动刷新</label
      >
      <details class="relative">
        <summary class="flex cursor-pointer items-center gap-1 text-sm">
          <Columns3 class="size-4" />列
        </summary>
        <div
          class="absolute right-0 z-10 flex min-w-40 flex-col gap-2 border bg-background p-3 shadow-sm"
        >
          <label class="flex items-center gap-2"
            ><input v-model="showEnvironment" type="checkbox" />Environment</label
          ><label class="flex items-center gap-2"
            ><input v-model="showTrace" type="checkbox" />Trace ID</label
          ><label class="flex items-center gap-2"
            ><input v-model="showAttributes" type="checkbox" />Attributes</label
          >
        </div>
      </details>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full table-fixed text-left text-sm">
        <thead>
          <tr>
            <th class="w-44" :aria-sort="sortDirection === 'desc' ? 'descending' : 'ascending'">
              <button class="flex items-center gap-1" aria-label="按时间排序" @click="sort">
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
              <td class="whitespace-nowrap">{{ new Date(log.timestamp).toLocaleString() }}</td>
              <td>
                <span class="font-medium" :style="{ color: colors[log.level] }">{{
                  log.level
                }}</span>
              </td>
              <td>
                <button
                  class="flex w-full items-start gap-1 text-left"
                  :aria-label="`查看日志 ${log.logId}`"
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
      没有匹配的日志
    </p>
    <footer class="flex items-center justify-end gap-3 text-sm">
      <Button
        variant="outline"
        size="sm"
        aria-label="上一页"
        :disabled="loading || page <= 1"
        @click="paginate(-1)"
        >上一页</Button
      ><span>第 {{ page }} 页</span
      ><Button
        variant="outline"
        size="sm"
        aria-label="下一页"
        :disabled="loading || !result || page * 20 >= result.total"
        @click="paginate(1)"
        >下一页</Button
      >
    </footer>
    <details class="border-t pt-3">
      <summary class="flex cursor-pointer items-center gap-2 text-sm">
        <Code class="size-4" />SDK 接入
      </summary>
      <pre class="mt-3 overflow-x-auto bg-muted/30 p-3 text-xs"><code>{{ snippet }}</code></pre>
    </details>
  </section>
</template>

<style scoped>
.logs-view select,
.logs-view input:not([type='checkbox']) {
  display: block;
  width: 100%;
  max-width: 100%;
  height: 36px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0 10px;
  background: var(--background);
  color: var(--foreground);
  font-size: 13px;
}
.logs-view label:has(select),
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

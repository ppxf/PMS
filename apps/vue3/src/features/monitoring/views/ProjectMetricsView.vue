<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { use } from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { Download, RefreshCw, Plus, X, ChartNoAxesCombined } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { metricCatalog, metricQuery } from '../api/metrics.api'
import { metricCsv, metricGroupLabel } from '../model/metrics'
import type { MetricAggregation, MetricCatalog, MetricQuery, MetricResult } from '../model/metrics'
use([LineChart, BarChart, CanvasRenderer, GridComponent, TooltipComponent, LegendComponent])
const route = useRoute()
const catalog = ref<MetricCatalog | null>(null),
  result = ref<MetricResult | null>(null)
const selected = ref(''),
  aggregation = ref<MetricAggregation>('sum'),
  range = ref(24),
  interval = ref(0)
const environment = ref(''),
  groupBy = ref(''),
  filterKey = ref(''),
  filterValue = ref(''),
  filterType = ref('string')
const filters = ref<MetricQuery['filters']>([]),
  chartType = ref<'line' | 'bar'>('line'),
  tab = ref('samples')
const loading = ref(false),
  error = ref(''),
  page = ref(1)
const aggregations: MetricAggregation[] = [
  'sum',
  'avg',
  'min',
  'max',
  'count',
  'p50',
  'p95',
  'p99',
  'last',
]
const metricKey = (item: { name: string; type: string; unit: string }) =>
  JSON.stringify([item.name, item.type, item.unit])
const identity = computed(() =>
  catalog.value?.items.find((item) => metricKey(item) === selected.value),
)
const chart = computed(() => ({
  animation: false,
  color: ['#0891b2', '#e11d48', '#16a34a', '#d97706', '#7c3aed'],
  tooltip: { trigger: 'axis' },
  legend: { type: 'scroll', bottom: 0 },
  grid: { left: 55, right: 20, top: 20, bottom: 60 },
  xAxis: { type: 'time' },
  yAxis: { type: 'value', name: identity.value?.unit === 'none' ? '' : identity.value?.unit },
  series:
    result.value?.series.map((series) => ({
      name: metricGroupLabel(series.groupValue),
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
    if (!catalog.value) {
      const next = await metricCatalog(group, project)
      if (current !== generation) return
      catalog.value = next
      if (!next.items.some((item) => metricKey(item) === selected.value)) {
        selected.value = next.items[0] ? metricKey(next.items[0]) : ''
        aggregation.value =
          next.items[0]?.type === 'gauge'
            ? 'last'
            : next.items[0]?.type === 'distribution'
              ? 'p95'
              : 'sum'
      }
    }
    const item = identity.value
    if (!item) return
    if (!appliedWindow) {
      const now = Date.now()
      appliedWindow = {
        start: new Date(now - range.value * 3600000).toISOString(),
        end: new Date(now).toISOString(),
      }
    }
    const query: MetricQuery = {
      name: item.name,
      type: item.type,
      unit: item.unit,
      ...appliedWindow,
      aggregation: aggregation.value,
      filters: filters.value.map((f) => ({ ...f })),
      page: page.value,
      pageSize: 20,
      ...(environment.value ? { environment: environment.value } : {}),
      ...(groupBy.value ? { groupBy: groupBy.value } : {}),
      ...(interval.value ? { intervalSeconds: interval.value } : {}),
    }
    const next = await metricQuery(group, project, query)
    if (current === generation) result.value = next
  } catch (e) {
    if (current === generation) error.value = e instanceof Error ? e.message : '指标查询失败'
  } finally {
    if (current === generation) loading.value = false
  }
}
function changeMetric() {
  aggregation.value =
    identity.value?.type === 'count' ? 'sum' : identity.value?.type === 'gauge' ? 'last' : 'p95'
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
function refresh() {
  catalog.value = null
  void load()
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
  value === null ? '-' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format(value)
watch(
  () => [route.params.groupSlug, route.params.projectSlug],
  () => {
    catalog.value = null
    selected.value = ''
    filters.value = []
    environment.value = ''
    groupBy.value = ''
    void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  generation++
})
</script>

<template>
  <section class="metrics-view space-y-4">
    <header class="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
      <div class="flex items-center gap-2">
        <ChartNoAxesCombined class="size-5 text-cyan-600" />
        <h2 class="text-xl font-semibold">Metrics</h2>
        <span class="text-sm text-muted-foreground">{{ route.params.projectSlug }}</span>
      </div>
      <div class="flex items-center gap-2">
        <select v-model.number="range" aria-label="时间范围" @change="load()">
          <option :value="1">最近 1 小时</option>
          <option :value="6">最近 6 小时</option>
          <option :value="24">最近 24 小时</option>
          <option :value="72">最近 3 天</option>
          <option :value="168">最近 7 天</option>
        </select>
        <Button
          variant="outline"
          size="icon"
          title="刷新"
          aria-label="刷新"
          :disabled="loading"
          @click="refresh"
          ><RefreshCw class="size-4"
        /></Button>
        <Button
          variant="outline"
          size="icon"
          title="导出当前页样本"
          aria-label="导出当前页样本"
          :disabled="!result?.samples.length"
          @click="exportCsv"
          ><Download class="size-4"
        /></Button>
      </div>
    </header>
    <p v-if="catalog && !catalog.enabled" class="text-sm text-amber-700">
      此项目的 Metrics 上报已关闭。<RouterLink
        :to="{ name: 'project-detail', params: route.params }"
        class="underline"
        >项目配置</RouterLink
      >
    </p>
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label
        >指标<select v-model="selected" aria-label="指标" @change="changeMetric">
          <option value="" disabled>选择指标</option>
          <option v-for="item in catalog?.items" :key="metricKey(item)" :value="metricKey(item)">
            {{ item.name }} · {{ item.type }} · {{ item.unit }}
          </option>
        </select></label
      >
      <label
        >聚合<select v-model="aggregation" aria-label="聚合" @change="load()">
          <option v-for="agg in aggregations" :key="agg" :value="agg">{{ agg }}</option>
        </select></label
      >
      <label
        >分组<select v-model="groupBy" aria-label="分组" @change="load()">
          <option value="">不分组</option>
          <option v-for="key in catalog?.attributes" :key="key">{{ key }}</option>
        </select></label
      >
      <label
        >环境<input
          v-model="environment"
          aria-label="环境"
          placeholder="全部环境"
          maxlength="128"
          @change="load()"
      /></label>
    </div>
    <form class="flex flex-wrap items-end gap-2" @submit.prevent="addFilter">
      <label class="min-w-40"
        >属性<select v-model="filterKey" aria-label="过滤属性">
          <option value="">选择属性</option>
          <option v-for="key in catalog?.attributes" :key="key">{{ key }}</option>
        </select></label
      >
      <label
        >值类型<select v-model="filterType" aria-label="过滤值类型" @change="changeFilterType">
          <option value="string">文本</option>
          <option value="number">数字</option>
          <option value="boolean">布尔值</option>
        </select></label
      >
      <label class="min-w-40"
        >等于<select v-if="filterType === 'boolean'" v-model="filterValue" aria-label="过滤值">
          <option value="true">true</option>
          <option value="false">false</option></select
        ><input
          v-else
          v-model="filterValue"
          aria-label="过滤值"
          maxlength="256"
          :type="filterType === 'number' ? 'number' : 'text'"
          step="any"
      /></label>
      <Button
        type="submit"
        variant="outline"
        size="icon"
        title="添加过滤"
        aria-label="添加过滤"
        :disabled="!filterKey || filters.length >= 10"
        ><Plus class="size-4"
      /></Button>
      <span
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
      <span
        >{{ result?.total ?? 0 }} 个样本<span v-if="result?.truncatedGroups">
          · 仅显示样本数最多的 20 个分组</span
        ><span v-if="catalog?.truncated"> · 指标目录已截断</span></span
      >
      <div class="flex gap-2">
        <select v-model="chartType" aria-label="图表类型">
          <option value="line">折线图</option>
          <option value="bar">柱状图</option></select
        ><select v-model.number="interval" aria-label="时间粒度" @change="load()">
          <option :value="0">自动粒度</option>
          <option :value="60" :disabled="range > 6">1 分钟</option>
          <option :value="300" :disabled="range > 24">5 分钟</option>
          <option :value="3600">1 小时</option>
          <option :value="86400">1 天</option>
        </select>
      </div>
    </div>
    <div class="relative h-80 min-w-0 overflow-hidden border-b" :aria-busy="loading">
      <p
        v-if="loading"
        role="status"
        class="grid h-full place-items-center text-sm text-muted-foreground"
      >
        加载中…
      </p>
      <VChart v-else-if="result?.total" :option="chart" autoresize class="h-full w-full" />
      <p v-else class="grid h-full place-items-center text-sm text-muted-foreground">
        {{ error ? '查询未完成' : '此时间范围内没有指标样本' }}
      </p>
    </div>
    <nav class="flex gap-4 border-b" aria-label="指标数据视图">
      <button
        v-for="item in [
          { id: 'samples', label: 'Samples' },
          { id: 'aggregates', label: 'Aggregates' },
        ]"
        :key="item.id"
        class="border-b-2 px-1 py-2 text-sm"
        :class="
          tab === item.id
            ? 'border-cyan-600 text-cyan-700'
            : 'border-transparent text-muted-foreground'
        "
        :aria-pressed="tab === item.id"
        @click="tab = item.id"
      >
        {{ item.label }}
      </button>
    </nav>
    <div class="overflow-x-auto">
      <table v-if="tab === 'samples'" class="w-full text-left text-sm">
        <thead>
          <tr>
            <th>Trace ID</th>
            <th>Value ({{ identity?.unit ?? 'none' }})</th>
            <th>Timestamp</th>
            <th>Environment</th>
            <th>Attributes</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="sample in result?.samples" :key="`${sample.eventId}:${sample.sampleIndex}`">
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
                }"
                class="font-mono text-cyan-700 underline"
                >{{ sample.traceId }}</RouterLink
              ><span v-else>-</span>
            </td>
            <td class="tabular-nums">{{ format(sample.value) }}</td>
            <td class="whitespace-nowrap">{{ new Date(sample.timestamp).toLocaleString() }}</td>
            <td>{{ sample.environment ?? '-' }}</td>
            <td class="max-w-80 break-words">{{ JSON.stringify(sample.attributes) }}</td>
          </tr>
        </tbody>
      </table>
      <table v-else class="w-full text-left text-sm">
        <thead>
          <tr>
            <th>{{ groupBy || 'Group' }}</th>
            <th>{{ aggregation }} ({{ identity?.unit ?? 'none' }})</th>
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
    </div>
    <footer v-if="tab === 'samples'" class="flex items-center justify-end gap-3 text-sm">
      <Button
        variant="outline"
        size="sm"
        :disabled="loading || page <= 1"
        aria-label="上一页"
        @click="paginate(-1)"
        >上一页</Button
      ><span>第 {{ page }} 页</span
      ><Button
        variant="outline"
        size="sm"
        :disabled="loading || !result || page * 20 >= result.total"
        aria-label="下一页"
        @click="paginate(1)"
        >下一页</Button
      >
    </footer>
  </section>
</template>

<style scoped>
.metrics-view select,
.metrics-view input {
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
.metrics-view label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  color: var(--muted-foreground);
  min-width: 0;
}
.metrics-view th {
  color: var(--muted-foreground);
  font-weight: 500;
}
.metrics-view th,
.metrics-view td {
  padding: 12px 10px;
  border-bottom: 1px solid var(--border);
}
</style>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { use } from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
} from 'echarts/components'
import VChart from 'vue-echarts'
import { ArrowDown, ArrowUp, ArrowUpDown } from '@lucide/vue'
import { Button } from '@/components/ui/button'
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
use([
  LineChart,
  BarChart,
  CanvasRenderer,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
])
const route = useRoute()
const group = computed(() => String(route.params.groupSlug)),
  project = computed(() => String(route.params.projectSlug))
function localInput(time: number) {
  const d = new Date(time)
  return new Date(time - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19)
}
const start = ref(localInput(Date.now() - 3600000)),
  end = ref(localInput(Date.now()))
const preset = ref('pages')
const metrics = ref<TraceMetric[]>(presetQuery('pages').metrics),
  filters = ref<TraceFilter[]>(presetQuery('pages').filters),
  groups = ref(presetQuery('pages').groupBy)
const primaryMetric = ref(0),
  limit = ref(5),
  interval = ref<TraceQuery['interval']>('auto')
const chartType = ref<'line' | 'bar'>('line')
const timeRange = ref('1h')
const timeRanges = [
  { value: '1h', label: '最近 1 小时', duration: 3600000 },
  { value: '6h', label: '最近 6 小时', duration: 6 * 3600000 },
  { value: '24h', label: '最近 24 小时', duration: 24 * 3600000 },
  { value: '3d', label: '最近 3 天', duration: 3 * 86400000 },
  { value: '7d', label: '最近 7 天', duration: 7 * 86400000 },
]
const intervals: { value: TraceQuery['interval']; label: string; duration?: number }[] = [
  { value: 'auto', label: '自动' },
  { value: '1m', label: '1 分钟', duration: 60000 },
  { value: '30m', label: '30 分钟', duration: 1800000 },
  { value: '1h', label: '1 小时', duration: 3600000 },
  { value: '3h', label: '3 小时', duration: 10800000 },
  { value: '6h', label: '6 小时', duration: 21600000 },
  { value: '1d', label: '1 天', duration: 86400000 },
]
function intervalDisabled(value: TraceQuery['interval']) {
  const duration = intervals.find((item) => item.value === value)?.duration
  return (
    duration != null &&
    Math.ceil((Date.parse(end.value) - Date.parse(start.value)) / duration) > 500
  )
}
function applyTimeRange() {
  const selected = timeRanges.find((range) => range.value === timeRange.value)
  if (!selected) return
  const now = Date.now()
  start.value = localInput(now - selected.duration)
  end.value = localInput(now)
  if (intervalDisabled(interval.value)) interval.value = 'auto'
  apply()
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
const series = ref<TraceSeries | null>(null),
  aggregates = ref<TraceAggregates | null>(null)
const seriesMetrics = ref<TraceMetric[]>(metrics.value.map((m) => ({ ...m })))
const filterField = ref('span.op'),
  filterOperator = ref<TraceFilter['operator']>('eq'),
  filterValue = ref('')
const availableGroups = computed(() =>
  fields.value.length ? fields.value.filter((f) => f.groupable).map((f) => f.name) : groupFields,
)
const availableFilters = computed(() =>
  fields.value.length
    ? fields.value.map((f) => f.name)
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
function query(): TraceQuery {
  const s = new Date(start.value),
    e = new Date(end.value)
  if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime()) || s >= e)
    throw new Error('请选择有效时间范围')
  return {
    start: s.toISOString(),
    end: e.toISOString(),
    filters: [...filters.value],
    metrics: metrics.value.map((m) => ({ ...m })),
    groupBy: groups.value.filter(Boolean).slice(0, 2),
    primaryMetric: primaryMetric.value,
    limit: limit.value,
    interval: interval.value,
    page: page.value,
    pageSize: 20,
    sortBy: tab.value === 'Aggregates' ? Number(sortBy.value) || 0 : sortBy.value,
    sortDirection: direction.value,
  }
}
let generation = 0
async function load() {
  const current = ++generation
  loading.value = true
  error.value = ''
  try {
    const q = query()
    const sampleQuery = { ...q, sortBy: tab.value === 'Aggregates' ? 'startTime' : q.sortBy }
    const result = await Promise.all([
      traceSeries(group.value, project.value, q),
      traceAggregates(group.value, project.value, {
        ...q,
        sortBy: tab.value === 'Aggregates' ? q.sortBy : primaryMetric.value,
      }),
      tab.value === 'Trace Samples'
        ? traceSamples(group.value, project.value, sampleQuery)
        : spanSamples(group.value, project.value, sampleQuery),
    ])
    if (current !== generation) return
    series.value = result[0]
    seriesMetrics.value = q.metrics
    aggregates.value = result[1]
    total.value = result[2].total
    if (tab.value === 'Trace Samples') traces.value = result[2].items as TraceSample[]
    else spans.value = result[2].items as Span[]
  } catch (cause) {
    if (current === generation)
      error.value =
        cause instanceof Error && cause.message === '请选择有效时间范围'
          ? cause.message
          : '无法加载 Traces，请重试'
  } finally {
    if (current === generation) loading.value = false
  }
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
function removeMetric(index: number) {
  metrics.value.splice(index, 1)
  primaryMetric.value = 0
}
function changePage(offset: number) {
  page.value += offset
  void load()
}
function applyPreset() {
  const q = presetQuery(preset.value)
  filters.value = q.filters
  metrics.value = q.metrics
  groups.value = q.groupBy
  primaryMetric.value = 0
  apply()
}
function addFilter() {
  const field = fields.value.find((f) => f.name === filterField.value)
  const parse = (v: string): unknown =>
    field?.type === 'number' ||
    metricFields.includes(filterField.value) ||
    filterField.value === 'http.status_code'
      ? Number(v)
      : field?.type === 'boolean' ||
          filterField.value === 'is_transaction' ||
          filterField.value === 'span.truncated'
        ? v === 'true'
        : v
  const value =
    filterOperator.value === 'in' || filterOperator.value === 'not_in'
      ? filterValue.value.split(',').map((v) => parse(v.trim()))
      : parse(filterValue.value.trim())
  filters.value.push({
    field: filterField.value,
    operator: filterOperator.value,
    ...(filterOperator.value === 'exists' ? {} : { value }),
  })
  filterValue.value = ''
}
function changeFunction(metric: TraceMetric) {
  if (metric.function === 'count' || metric.function === 'errorRate') metric.field = 'spans'
  else if (metric.field === 'spans') metric.field = 'span.duration'
}
const units = computed(() => [...new Set(seriesMetrics.value.map(metricUnit))])
const chart = computed(() => ({
  animation: false,
  grid: { left: 80, right: 80, top: 70, bottom: 70 },
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
            `${p.seriesName ?? ''}: ${p.data?.value?.[1] == null ? '—' : p.data.value[1]} (n=${p.data?.sampleCount ?? 0})`,
        )
        .join('\n')
    },
  },
  xAxis: { type: 'time' },
  yAxis: units.value.map((unit, index) => ({
    type: 'value',
    name: unit,
    position: index % 2 ? 'right' : 'left',
    offset: Math.floor(index / 2) * 45,
  })),
  dataZoom: [
    { type: 'inside', filterMode: 'none' },
    { type: 'slider', filterMode: 'none' },
  ],
  series: (series.value?.series ?? []).map((s) => {
    const metric = seriesMetrics.value[s.metricIndex]!
    const group = series.value?.groups.find((g) => g.key === s.groupKey)
    return {
      type: chartType.value,
      smooth: false,
      connectNulls: false,
      showSymbol: chartType.value === 'line',
      yAxisIndex: units.value.indexOf(metricUnit(metric)),
      name: `${group?.values.map((v) => (v == null ? '未知' : JSON.stringify(v))).join(' / ') || '全部'} · ${metric.function}(${metric.field})`,
      data: s.points.map((p) => ({
        value: [
          p.timestamp,
          p.value == null ? null : metric.function === 'errorRate' ? p.value * 100 : p.value,
        ],
        sampleCount: p.sampleCount,
      })),
      tooltip: {
        valueFormatter: (v: unknown) =>
          typeof v !== 'number' ? '—' : `${v} ${metricUnit(metric)}`,
      },
    }
  }),
}))
// ECharts provides percentages for slider and absolute timestamps for inside zoom.
function zoom(payload: unknown) {
  if (!payload || typeof payload !== 'object') return
  const event = payload as {
    start?: number
    end?: number
    startValue?: number
    endValue?: number
    batch?: { start?: number; end?: number; startValue?: number; endValue?: number }[]
  }
  const range = event.batch?.[0] ?? event
  const a = new Date(start.value).getTime(),
    b = new Date(end.value).getTime()
  const from = range.startValue ?? a + ((b - a) * (range.start ?? 0)) / 100,
    to = range.endValue ?? a + ((b - a) * (range.end ?? 100)) / 100
  if (from >= to) return
  timeRange.value = 'custom'
  start.value = localInput(from)
  end.value = localInput(to)
  apply()
}
function detailLink(traceId: string) {
  return {
    name: 'project-trace-detail',
    params: { groupSlug: group.value, projectSlug: project.value, traceId },
    query: { highlight: JSON.stringify(filters.value) },
  }
}
watch(tab, () => {
  sortBy.value = tab.value === 'Aggregates' ? '0' : 'startTime'
  direction.value = 'desc'
  apply()
})
watch([group, project], () => {
  page.value = 1
  void load()
})
onMounted(async () => {
  try {
    fields.value = await traceFields(group.value, project.value)
  } catch {
    /* Backend still independently validates all queries. */
  }
  void load()
})
</script>

<template>
  <section class="traces-page space-y-6">
    <div>
      <h2 class="text-2xl font-semibold">Traces · {{ project }}</h2>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <label
        >快捷查询
        <select v-model="preset" class="control" @change="applyPreset">
          <option value="pages">页面性能</option>
          <option value="slow">慢接口（fetch）</option>
          <option value="requests">请求量（fetch）</option>
          <option value="statuses">状态分布（fetch）</option>
          <option value="ttfb">首字节等待（fetch）</option>
          <option value="sizes">大响应（fetch）</option>
          <option value="versions">版本回归（pageload，请补充同一 span.name）</option>
          <option value="all">全部 spans</option>
        </select></label
      >
      <Button
        variant="outline"
        @click="filters.push({ field: 'span.op', operator: 'eq', value: 'http.client' })"
        >添加 HTTP 筛选</Button
      >
    </div>
    <div class="filter-panel rounded-xl border p-5 space-y-4">
      <div class="flex flex-wrap gap-2">
        <select v-model="filterField" aria-label="筛选字段" class="control">
          <option v-for="f in availableFilters" :key="f">{{ f }}</option></select
        ><select v-model="filterOperator" aria-label="筛选运算符" class="control">
          <option v-for="op in filterOperators" :key="op">{{ op }}</option></select
        ><input
          v-if="filterOperator !== 'exists'"
          v-model="filterValue"
          class="control"
          aria-label="筛选值"
          placeholder="值 / 多值用逗号分隔"
        /><Button variant="outline" @click="addFilter">添加条件</Button>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="(f, i) in filters"
          :key="i"
          class="filter-chip rounded-md border px-3 py-1.5 text-sm"
          :aria-label="`删除条件 ${f.field}`"
          @click="filters.splice(i, 1)"
        >
          {{ f.field }} {{ f.operator }} {{ f.value }} ×
        </button>
      </div>
    </div>
    <div class="grid items-stretch gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside class="visualize-panel space-y-5 rounded-xl border p-5">
        <h3 class="font-semibold">Visualize</h3>
        <div v-for="(metric, i) in metrics" :key="i" class="space-y-3 border-b pb-4">
          <label class="flex items-center gap-2"
            ><input v-model="primaryMetric" type="radio" :value="i" />主指标 {{ i + 1 }}</label
          >
          <select
            v-model="metric.function"
            :aria-label="`聚合函数 ${i + 1}`"
            class="control w-full"
            @change="changeFunction(metric)"
          >
            <option v-for="f in ['count', 'avg', 'p50', 'p95', 'errorRate']" :key="f">
              {{ f }}
            </option>
          </select>
          <select
            v-model="metric.field"
            :aria-label="`指标字段 ${i + 1}`"
            class="control w-full"
            :disabled="metric.function === 'count' || metric.function === 'errorRate'"
          >
            <option v-if="metric.function === 'count' || metric.function === 'errorRate'">
              spans
            </option>
            <option v-for="f in metricFields" v-else :key="f">{{ f }}</option>
          </select>
          <Button v-if="metrics.length > 1" variant="outline" @click="removeMetric(i)"
            >删除指标</Button
          >
        </div>
        <Button
          v-if="metrics.length < 5"
          variant="outline"
          @click="metrics.push({ function: 'avg', field: 'span.duration' })"
          >添加指标系列</Button
        >
        <h3 class="font-semibold">Group By（最多两个）</h3>
        <select
          v-for="i in 2"
          :key="i"
          v-model="groups[i - 1]"
          :aria-label="`分组 ${i}`"
          class="control w-full"
        >
          <option value="">不分组</option>
          <option
            v-for="f in availableGroups"
            :key="f"
            :disabled="groups.includes(f) && groups[i - 1] !== f"
          >
            {{ f }}
          </option>
        </select>
        <label class="top-limit"
          >Top
          <select v-model.number="limit" class="control">
            <option v-for="n in [5, 6, 7, 8, 9, 10]" :key="n">{{ n }}</option>
          </select></label
        >
        <Button class="trace-blue-action" :disabled="loading" @click="apply">更新图表</Button>
      </aside>
      <div class="chart-panel min-w-0 rounded-xl border p-5">
        <div
          class="chart-toolbar mb-5 flex flex-wrap items-center justify-end gap-3"
          role="group"
          aria-label="图表设置"
        >
          <select
            v-model="timeRange"
            class="control"
            aria-label="时间范围"
            @change="applyTimeRange"
          >
            <option v-if="timeRange === 'custom'" value="custom">自定义范围（缩放）</option>
            <option v-for="range in timeRanges" :key="range.value" :value="range.value">
              {{ range.label }}
            </option>
          </select>
          <select v-model="chartType" class="control" aria-label="图表类型">
            <option value="line">折线图</option>
            <option value="bar">柱状图</option>
          </select>
          <select v-model="interval" class="control" aria-label="时间粒度" @change="apply">
            <option
              v-for="item in intervals"
              :key="item.value"
              :value="item.value"
              :disabled="intervalDisabled(item.value)"
            >
              {{ item.label }}
            </option>
          </select>
        </div>
        <p v-if="loading" role="status">加载中…</p>
        <VChart
          v-if="series"
          :option="chart"
          :update-options="{ replaceMerge: ['series'] }"
          class="chart"
          autoresize
          @datazoom="zoom"
        />
        <p v-else class="py-20 text-center">暂无统计数据</p>
        <p class="text-sm text-muted-foreground">
          匹配
          {{ series?.sampleCount ?? 0 }}
          条采样记录。拖动缩放同步查询样本和聚合。时间按本地时区显示。
        </p>
      </div>
    </div>
    <div v-if="error" role="alert" class="text-destructive">
      {{ error }} <Button variant="outline" @click="load">重试</Button>
    </div>
    <nav class="result-tabs flex flex-wrap gap-2" aria-label="Traces 结果视图">
      <Button
        v-for="t in tabs"
        :key="t"
        :variant="tab === t ? 'default' : 'outline'"
        :class="{ 'trace-blue-action': tab === t }"
        @click="tab = t"
        >{{ t }}</Button
      >
    </nav>
    <div class="results-table overflow-x-auto rounded-xl border">
      <table v-if="tab === 'Span Samples'" class="w-full text-sm">
        <thead>
          <tr>
            <th>Span</th>
            <th>类型</th>
            <th>根操作</th>
            <th :aria-sort="columnSort('startTime')">
              <button class="sort-header" aria-label="按时间排序" @click="sortColumn('startTime')">
                时间 <component :is="sortIcon('startTime')" class="sort-icon" aria-hidden="true" />
              </button>
            </th>
            <th :aria-sort="columnSort('durationMs')">
              <button class="sort-header" aria-label="按耗时排序" @click="sortColumn('durationMs')">
                耗时 <component :is="sortIcon('durationMs')" class="sort-icon" aria-hidden="true" />
              </button>
            </th>
            <th>状态 / 完整性</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in spans" :key="s.spanId">
            <td>
              <RouterLink class="text-primary hover:underline" :to="detailLink(s.traceId)">{{
                s.name
              }}</RouterLink>
            </td>
            <td>{{ s.op }}</td>
            <td>{{ s.isTransaction }}</td>
            <td>{{ new Date(s.startTime).toLocaleString() }}</td>
            <td>{{ s.durationMs }} ms</td>
            <td>{{ s.status }} {{ s.truncated ? '截断' : '' }}</td>
          </tr>
        </tbody>
      </table>
      <table v-else-if="tab === 'Trace Samples'" class="w-full text-sm">
        <thead>
          <tr>
            <th>Trace</th>
            <th :aria-sort="columnSort('startTime')">
              <button
                class="sort-header"
                aria-label="按开始时间排序"
                @click="sortColumn('startTime')"
              >
                开始时间
                <component :is="sortIcon('startTime')" class="sort-icon" aria-hidden="true" />
              </button>
            </th>
            <th :aria-sort="columnSort('durationMs')">
              <button class="sort-header" aria-label="按跨度排序" @click="sortColumn('durationMs')">
                跨度 <component :is="sortIcon('durationMs')" class="sort-icon" aria-hidden="true" />
              </button>
            </th>
            <th>已保留 spans</th>
            <th>完整性</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in traces" :key="t.traceId">
            <td>
              <RouterLink class="text-primary hover:underline" :to="detailLink(t.traceId)">{{
                t.traceId
              }}</RouterLink>
            </td>
            <td>{{ new Date(t.startTime).toLocaleString() }}</td>
            <td>{{ t.durationMs }} ms</td>
            <td>{{ t.spanCount }}</td>
            <td>{{ t.truncated ? '截断' : '已保留记录' }}</td>
          </tr>
        </tbody>
      </table>
      <table v-else class="w-full text-sm">
        <thead>
          <tr>
            <th>分组</th>
            <th v-for="(m, i) in seriesMetrics" :key="i" :aria-sort="columnSort(String(i))">
              <button
                class="sort-header"
                :aria-label="`按 ${m.function}(${m.field}) 排序`"
                @click="sortColumn(String(i))"
              >
                {{ m.function }}({{ m.field }})
                <component :is="sortIcon(String(i))" class="sort-icon" aria-hidden="true" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in aggregates?.items" :key="a.groupKey">
            <td>{{ a.groupValues.map((v) => v ?? '未知').join(' / ') || '全部' }}</td>
            <td v-for="(m, i) in seriesMetrics" :key="i">
              {{ formatMetric(a.values[i], m) }}
              <span class="text-muted-foreground">(n={{ a.sampleCounts[i] ?? 0 }})</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p
        v-if="!loading && (tab === 'Aggregates' ? !aggregates?.items.length : !total)"
        class="p-8 text-center text-muted-foreground"
      >
        暂无数据
      </p>
    </div>
    <div v-if="tab !== 'Aggregates'" class="flex items-center gap-3">
      <Button
        aria-label="上一页"
        variant="outline"
        :disabled="page === 1 || loading"
        @click="changePage(-1)"
        >上一页</Button
      ><span>第 {{ page }} 页 · {{ total }} 条</span
      ><Button
        aria-label="下一页"
        variant="outline"
        :disabled="page * 20 >= total || loading"
        @click="changePage(1)"
        >下一页</Button
      >
    </div>
  </section>
</template>
<style scoped>
.trace-blue-action {
  background-color: #5b8def;
  border-color: #5b8def;
  color: #fff;
}
.trace-blue-action:hover {
  background-color: #477bdb;
  border-color: #477bdb;
}
.trace-blue-action:focus-visible {
  border-color: #5b8def;
  --tw-ring-color: #5b8def80;
}
.control {
  min-height: 40px;
  max-width: 100%;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  background-color: var(--background);
  color: var(--foreground);
  font-size: 0.875rem;
  line-height: 1.4;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
select.control {
  appearance: none;
  padding-right: 2.5rem;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23717b8c' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-position: right 0.75rem center;
  background-repeat: no-repeat;
}
.control:focus-visible,
.sort-header:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 3px;
}
.control:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
label {
  font-size: 0.875rem;
}
.visualize-panel,
.filter-panel,
.chart-panel,
.results-table {
  background: var(--background);
}
.chart-panel {
  display: flex;
  flex-direction: column;
}
.chart-toolbar {
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border);
}
.chart-toolbar select[aria-label='时间范围'] {
  min-width: 155px;
}
.chart-toolbar select[aria-label='图表类型'] {
  min-width: 115px;
}
.chart-toolbar select[aria-label='时间粒度'] {
  min-width: 110px;
}
.top-limit {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.chart {
  flex: 1;
  min-height: 360px;
  height: 360px;
}
th,
td {
  padding: 1rem 1.25rem;
  text-align: left;
  border-bottom: 1px solid var(--border);
}
th {
  background: var(--muted);
  color: var(--muted-foreground);
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}
tbody tr:last-child td {
  border-bottom: 0;
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
  .chart-toolbar {
    justify-content: flex-start;
    gap: 0.75rem;
  }
  .chart-toolbar select {
    flex: 1;
  }
  .chart {
    min-height: 300px;
    height: 300px;
  }
  th,
  td {
    padding: 0.75rem 1rem;
  }
}
</style>

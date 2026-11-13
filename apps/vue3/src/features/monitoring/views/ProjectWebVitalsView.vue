<script setup lang="ts">
import { formatDateTime } from '@/lib/date-time'
import { useProjectAccessStore } from '../model/project-access.store'
const projectAccess = useProjectAccessStore()
import EmptyState from '@/components/ui/empty-state/EmptyState.vue'
import TablePagination from '@/components/ui/pagination/TablePagination.vue'
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { webVitalsQuery } from '../api/web-vitals.api'
import { formatRate, formatVital, vitalRating, vitalThresholds } from '../model/web-vitals'
import type { VitalOverview, VitalPage, VitalSample } from '../model/web-vitals'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
import { GridComponent, TooltipComponent, MarkLineComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import FormSelect from '@/components/ui/select/FormSelect.vue'
import { Button } from '@/components/ui/button'
import { RefreshCw } from '@lucide/vue'
use([LineChart, CanvasRenderer, GridComponent, TooltipComponent, MarkLineComponent])
const metric = ref('LCP')
const series = ref<{ timestamp: string; name: string; p75: number | null; count: number }[]>([])
const chart = computed(() => {
  const rows = series.value.filter((x) => x.name === metric.value)
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 60, right: 20, top: 20, bottom: 40 },
    xAxis: { type: 'category', data: rows.map((x) => new Date(x.timestamp).toLocaleTimeString()) },
    yAxis: { type: 'value', name: metric.value === 'CLS' ? 'score' : 'ms' },
    series: [
      {
        type: 'line',
        connectNulls: true,
        showSymbol: true,
        showAllSymbol: true,
        symbolSize: 6,
        data: rows.map((x) => x.p75),
        markLine: {
          silent: true,
          data: (vitalThresholds[metric.value] || []).map((yAxis) => ({ yAxis })),
        },
      },
    ],
  }
})
const route = useRoute(),
  router = useRouter()
const overview = ref<VitalOverview | null>(null),
  pages = ref<VitalPage[]>([]),
  samples = ref<VitalSample[]>([]),
  total = ref(0)
const error = ref(''),
  loading = ref(false)
const opportunities = ref<
  { route: string; name: string; p75: number; count: number; poor: number; threshold: number }[]
>([])
const refresh = ref('60')
const failures = ref<string[]>([])
const assessment = computed(() => {
  const core = ['LCP', 'INP', 'CLS'].map((name) =>
    overview.value?.metrics.find((item) => item.name === name),
  )
  if (core.some((item) => !item || item.count < 5 || item.p75 === null)) return 'Insufficient data'
  return core.every((item) => item && vitalRating(item.name, item.p75) === 'Good')
    ? 'Passed'
    : 'Needs improvement'
})
const page = computed(() => Math.max(1, Number(route.query.page) || 1))
const detail = computed(() => route.name === 'project-web-vitals-detail')
const params = computed(() => ({
  groupSlug: route.params.groupSlug,
  projectSlug: route.params.projectSlug,
}))
function update(key: string, value: string) {
  void router.replace({
    query: {
      range: route.query.range,
      environment: route.query.environment,
      device: route.query.device,
      route: detail.value ? route.query.route : undefined,
      traceId: route.query.traceId,
      [key]: value || undefined,
      page: key === 'page' ? value : undefined,
    },
  })
}
let controller: AbortController | undefined
let windowKey = ''
let queryWindow: { start: string; end: string } | undefined
function refreshData() {
  queryWindow = undefined
  void load()
}
async function load(only?: unknown) {
  const retry = typeof only === 'string' ? only : undefined
  controller?.abort()
  const current = new AbortController()
  controller = current
  loading.value = true
  error.value = ''
  if (!retry) {
    overview.value = null
    pages.value = []
    samples.value = []
    series.value = []
    opportunities.value = []
    failures.value = []
  }
  const hours =
    ({ '1h': 1, '24h': 24, '7d': 168, '28d': 672 } as Record<string, number>)[
      String(route.query.range)
    ] || 24
  const nextWindowKey = JSON.stringify([
    route.params,
    Object.entries(route.query).filter(([key]) => key !== 'page'),
  ])
  if (!queryWindow || nextWindowKey !== windowKey) {
    const now = Date.now()
    queryWindow = {
      start: new Date(now - hours * 3600000).toISOString(),
      end: new Date(now).toISOString(),
    }
    windowKey = nextWindowKey
  }
  const query: Record<string, unknown> = {
    ...queryWindow,
    page: page.value,
    pageSize: 20,
    intervalSeconds: 3600,
  }
  for (const key of ['environment', 'device', 'traceId'])
    if (route.query[key]) query[key] = route.query[key]
  if (detail.value && route.query.route) query.route = route.query.route
  const request = <T,>(resource: string): Promise<T> =>
    retry && retry !== resource
      ? Promise.resolve(
          (
            {
              overview: overview.value,
              pages: { items: pages.value, total: total.value },
              samples: { items: samples.value, total: total.value },
              timeseries: { items: series.value },
              opportunities: { items: opportunities.value },
            } as Record<string, unknown>
          )[resource] as T,
        )
      : webVitalsQuery<T>(
          String(route.params.groupSlug),
          String(route.params.projectSlug),
          resource,
          query,
          current.signal,
        )
  try {
    const results = await Promise.allSettled([
      request<VitalOverview>('overview'),
      request<{ items: VitalPage[]; total: number }>('pages'),
      detail.value
        ? request<{ items: VitalSample[]; total: number }>('samples')
        : Promise.resolve({ items: [], total: 0 }),
      request<{ items: typeof series.value }>('timeseries'),
      request<{ items: typeof opportunities.value }>('opportunities'),
    ])
    if (current.signal.aborted) return
    const [summary, table, records, trend, actions] = results
    const names = ['overview', 'pages', 'samples', 'timeseries', 'opportunities']
    failures.value = names.filter(
      (name, index) =>
        results[index]?.status === 'rejected' ||
        (retry && retry !== name && failures.value.includes(name)),
    )
    if (summary?.status === 'fulfilled') overview.value = summary.value
    else if (!overview.value)
      overview.value = {
        pageViews: 0,
        completeSamples: 0,
        passingSamples: 0,
        passRate: null,
        coverage: 0,
        metrics: [],
        lastReceivedAt: null,
      }
    if (table?.status === 'fulfilled') {
      const value = table.value
      pages.value = value.items
      total.value = value.total
    }
    if (records?.status === 'fulfilled') {
      const value = records.value
      samples.value = value.items
      if (detail.value) total.value = value.total
    }
    if (trend?.status === 'fulfilled') series.value = trend.value.items
    if (actions?.status === 'fulfilled') opportunities.value = actions.value.items
    error.value = failures.value.join(', ')
  } catch (e) {
    if (!current.signal.aborted)
      error.value = e instanceof Error ? e.message : 'Unable to load Web Vitals'
  } finally {
    if (!current.signal.aborted) loading.value = false
  }
}
watch(
  () => route.fullPath,
  () => {
    void load()
  },
  { immediate: true },
)
let elapsed = 0
const timer = setInterval(() => {
  elapsed++
  if (
    refresh.value !== 'off' &&
    elapsed >= Number(refresh.value) &&
    document.visibilityState === 'visible'
  ) {
    elapsed = 0
    refreshData()
  }
}, 1000)
onBeforeUnmount(() => {
  controller?.abort()
  clearInterval(timer)
})
</script>
<template>
  <main class="space-y-5 p-6">
    <RouterLink
      v-if="detail"
      :to="{
        name: 'project-web-vitals',
        params,
        query: { ...route.query, route: undefined, page: undefined },
      }"
      >← All pages</RouterLink
    >
    <header class="flex justify-between">
      <div>
        <h1 class="page-title break-words">{{ detail ? route.query.route : 'Web Vitals' }}</h1>
        <p class="text-sm text-muted-foreground">Real user experience · p75</p>
        <p v-if="overview?.lastReceivedAt" class="text-xs text-muted-foreground">
          Last metric received: {{ formatDateTime(overview.lastReceivedAt) }}
        </p>
      </div>
      <Button
        variant="outline"
        size="icon"
        title="Refresh"
        aria-label="Refresh"
        :disabled="loading"
        @click="refreshData"
      >
        <RefreshCw class="size-4" aria-hidden="true" />
      </Button>
    </header>
    <div
      class="flex flex-wrap items-end gap-3 rounded-xl border bg-background p-4"
      aria-label="Web Vitals filters"
    >
      <label class="flex w-40 flex-col gap-2 text-xs text-muted-foreground">
        <span>Time range</span>
        <FormSelect
          :model-value="String(route.query.range || '24h')"
          aria-label="Time range"
          :options="[
            { value: '1h', label: 'Last hour' },
            { value: '24h', label: 'Last 24 hours' },
            { value: '7d', label: 'Last 7 days' },
            { value: '28d', label: 'Last 28 days' },
          ]"
          @change="update('range', $event)"
        />
      </label>
      <label class="flex w-44 flex-col gap-2 text-xs text-muted-foreground">
        <span>Environment</span>
        <FormSelect
          :model-value="String(route.query.environment || '')"
          aria-label="Environment"
          :options="[
            { value: '', label: 'All environments' },
            { value: 'development', label: 'development' },
            { value: 'production', label: 'production' },
          ]"
          @change="update('environment', $event)"
        />
      </label>
      <label class="flex w-40 flex-col gap-2 text-xs text-muted-foreground">
        <span>Device</span>
        <FormSelect
          :model-value="String(route.query.device || '')"
          aria-label="Device"
          :options="[
            { value: '', label: 'All devices' },
            { value: 'desktop', label: 'Desktop' },
            { value: 'mobile', label: 'Mobile' },
            { value: 'tablet', label: 'Tablet' },
            { value: 'unknown', label: 'Unknown' },
          ]"
          @change="update('device', $event)"
        />
      </label>
      <label class="flex w-40 flex-col gap-2 text-xs text-muted-foreground">
        <span>Auto refresh</span>
        <FormSelect
          v-model="refresh"
          aria-label="Auto refresh"
          :options="[
            { value: 'off', label: 'Off' },
            { value: '60', label: 'Every minute' },
            { value: '300', label: 'Every 5 minutes' },
          ]"
        />
      </label>
    </div>
    <p v-if="loading" role="status">Loading Web Vitals…</p>
    <p v-if="error" role="alert" class="rounded-xl border p-4 text-red-700">
      {{ error }}
      <button
        v-for="resource in failures"
        :key="resource"
        class="ml-3 underline"
        @click="load(resource)"
      >
        Retry {{ resource }}
      </button>
    </p>
    <template v-if="overview">
      <EmptyState
        v-if="!loading && !overview.pageViews && !failures.includes('overview')"
        class="rounded-lg border bg-background p-6"
        title="No Web Vitals received for these filters."
        description="Basic SDK setup automatically collects supported browser metrics."
      />
      <div class="grid items-stretch gap-4 lg:grid-cols-3">
        <section class="min-w-0 rounded-xl border bg-background p-5">
          <div class="flex items-center justify-between gap-3">
            <h2 class="font-semibold">Core Web Vitals pass rate</h2>
            <details class="relative text-xs text-muted-foreground">
              <summary class="cursor-pointer">About</summary>
              <p
                class="absolute right-0 z-10 mt-2 w-64 rounded-lg border bg-background p-3 shadow-md"
              >
                Experiences with all three core metrics rated Good, divided by complete LCP, INP and
                CLS experiences. Pages without interaction may have no INP. The p75 assessment
                requires at least 5 samples for each core metric.
              </p>
            </details>
          </div>
          <div class="mt-5 flex flex-wrap items-center gap-5">
            <div
              class="flex size-28 shrink-0 items-center justify-center rounded-full"
              :style="{
                background:
                  overview.passRate === null
                    ? '#e5e7eb'
                    : `conic-gradient(#22c55e ${overview.passRate * 100}%, #e5e7eb 0)`,
              }"
            >
              <span
                class="flex size-[88px] items-center justify-center rounded-full bg-background p-2 text-center text-sm font-semibold"
                >{{ formatRate(overview.passRate) }}</span
              >
            </div>
            <div class="min-w-0 space-y-2 text-sm">
              <p class="font-medium">{{ assessment }}</p>
              <p class="text-muted-foreground">
                {{ overview.completeSamples }} complete / {{ overview.pageViews }} page views
              </p>
              <p class="text-muted-foreground">{{ formatRate(overview.coverage) }} coverage</p>
            </div>
          </div>
        </section>
        <section class="min-w-0 rounded-xl border bg-background p-5 lg:col-span-2">
          <div class="flex justify-between">
            <h2 class="font-semibold">Metric trend · p75</h2>
            <FormSelect
              v-model="metric"
              aria-label="Trend metric"
              class="w-28"
              :options="
                ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'].map((value) => ({ value, label: value }))
              "
            />
          </div>
          <VChart
            v-if="series.some((x) => x.name === metric)"
            :option="chart"
            autoresize
            class="h-64"
            style="height: 220px; width: 100%"
          />
          <p
            v-else
            class="flex h-40 items-center justify-center rounded-lg bg-muted/30 text-sm text-muted-foreground"
          >
            Insufficient trend data
          </p>
        </section>
      </div>
      <section
        class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
        aria-label="Web Vitals measurements"
      >
        <div
          v-for="item in overview.metrics"
          :key="item.name"
          class="min-w-0 space-y-3 rounded-xl border bg-background p-4"
        >
          <div>
            {{ item.name }}
            <p class="text-xs text-muted-foreground">
              {{ item.count }} samples · {{ formatRate(item.coverage) }} coverage
            </p>
          </div>
          <div>
            <strong>{{ formatVital(item.name, item.p75) }}</strong>
            <p>{{ vitalRating(item.name, item.p75) }}</p>
            <div
              class="mt-2 flex h-1.5 w-full overflow-hidden rounded bg-muted"
              :aria-label="`${item.name} rating distribution`"
            >
              <span
                v-for="(count, index) in [item.good, item.needsImprovement, item.poor]"
                :key="index"
                :style="{
                  width: `${item.count ? (count / item.count) * 100 : 0}%`,
                  background: ['#22c55e', '#f59e0b', '#ef4444'][index],
                }"
              />
            </div>
          </div>
        </div>
      </section>
      <section class="rounded-xl border bg-white p-5">
        <h2 class="font-semibold">Performance opportunities</h2>
        <p class="mt-2 text-xs text-muted-foreground">
          Core pass rate requires LCP, INP and CLS together. Good thresholds: LCP ≤ 2500 ms, INP ≤
          200 ms, CLS ≤ 0.1.
        </p>
        <div
          v-for="item in opportunities.filter((x) => x.count >= 5)"
          :key="`${item.route}:${item.name}`"
          class="mt-4 flex justify-between"
        >
          <RouterLink
            class="underline"
            :to="{
              name: 'project-web-vitals-detail',
              params,
              query: { ...route.query, route: item.route, page: undefined },
            }"
            >{{ item.route }}</RouterLink
          ><span
            >{{ item.name }} · {{ formatVital(item.name, item.p75) }} · {{ item.poor }} poor
            samples</span
          >
        </div>
      </section>
      <section v-if="!detail" class="overflow-auto rounded-xl border bg-white p-5">
        <h2 class="mb-4 font-semibold">Pages</h2>
        <div class="table-surface">
          <table class="app-table">
            <thead>
              <tr>
                <th>Page</th>
                <th>Page views</th>
                <th>Poor experiences</th>
                <th>LCP coverage</th>
                <th v-for="name in ['LCP', 'INP', 'CLS', 'FCP', 'TTFB']" :key="name">
                  {{ name }} p75
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in pages" :key="item.route" class="border-t">
                <td class="py-3">
                  <RouterLink
                    class="underline"
                    :to="{
                      name: 'project-web-vitals-detail',
                      params,
                      query: { ...route.query, route: item.route, page: undefined },
                    }"
                    >{{ item.route }}</RouterLink
                  >
                </td>
                <td>{{ item.pageViews }}</td>
                <td>{{ item.poorPageViews }}</td>
                <td>
                  {{
                    formatRate(
                      item.metrics.find((metric) => metric.name === 'LCP')?.coverage ?? null,
                    )
                  }}
                </td>
                <td v-for="name in ['LCP', 'INP', 'CLS', 'FCP', 'TTFB']" :key="name">
                  {{ formatVital(name, item.metrics.find((x) => x.name === name)?.p75 ?? null) }}
                </td>
              </tr>
            </tbody>
          </table>
          <EmptyState
            v-if="!loading && !failures.includes('pages') && !pages.length"
            class="p-8"
            title="No matching pages"
          />
        </div>
        <TablePagination
          class="mt-4"
          :page="page"
          :total="total"
          :page-size="20"
          :busy="loading"
          unit="pages"
          label="Web Vitals pages pagination"
          @change="update('page', String($event))"
        />
      </section>
      <section v-if="detail" class="rounded-xl border bg-white p-5">
        <h2 class="font-semibold">Page samples and attribution</h2>
        <EmptyState
          v-if="!loading && !failures.includes('samples') && !samples.length"
          class="p-8"
          title="No samples for this page"
        />
        <article v-for="sample in samples" :key="sample.pageViewId" class="mt-4 border-t pt-3">
          <p>{{ formatDateTime(sample.startedAt) }} · {{ sample.pageViewId }}</p>
          <RouterLink
            v-if="sample.traceAvailable && sample.traceId"
            class="underline"
            :to="{
              name: 'project-trace-detail',
              params: { ...params, traceId: sample.traceId },
              query: { spanId: sample.spanId },
            }"
            >Open sample trace</RouterLink
          >
          <p v-else>Trace unavailable</p>
          <div v-for="measurement in sample.measurements" :key="measurement.name">
            {{ measurement.name }} {{ formatVital(measurement.name, measurement.value) }}
            <pre v-if="measurement.attribution" class="code-block" tabindex="0">{{
              JSON.stringify(measurement.attribution, null, 2)
            }}</pre>
          </div>
        </article>
        <TablePagination
          class="mt-4"
          :page="page"
          :total="total"
          :page-size="20"
          :busy="loading"
          unit="samples"
          label="Web Vitals samples pagination"
          previous-label="Previous samples"
          next-label="Next samples"
          @change="update('page', String($event))"
        />
      </section>
    </template>
  </main>
</template>

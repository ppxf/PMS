<script setup lang="ts">
import { useProjectAccessStore } from '../model/project-access.store'
const projectAccess = useProjectAccessStore()
import EmptyState from '@/components/ui/empty-state/EmptyState.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ArrowLeft, GitBranch, Clock3, Layers, ChevronRight } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { traceDetail } from '../api/traces.api'
import { waterfallRows, matchesSpanFilters } from '../model/traces'
import type { Span, TraceFilter } from '../model/traces'
import TraceMetricsPanel from '../components/TraceMetricsPanel.vue'
import TraceWebVitalsPanel from '../components/TraceWebVitalsPanel.vue'
import { traceVitalMarkers, resourceDetails, spanCategory } from '../model/trace-performance'
import { formatVital, type VitalSample } from '../model/web-vitals'
const route = useRoute(),
  spans = ref<Span[]>([]),
  selected = ref<Span | null>(null),
  hasMore = ref(false),
  cursor = ref<string>(),
  loading = ref(false),
  error = ref('')
const rows = computed(() => waterfallRows(spans.value))
const search = ref('')
const category = ref('all')
const collapsed = ref(new Set<string>())
const vitalSamples = ref<VitalSample[]>([])
const childParents = computed(() => new Set(spans.value.map((span) => span.parentSpanId)))
const visibleRows = computed(() => {
  const query = search.value.trim().toLowerCase()
  const filtering = Boolean(query || category.value !== 'all')
  const byId = new Map(spans.value.map((span) => [span.spanId, span]))
  const keep = new Set<string>()
  for (const { span } of rows.value) {
    if (category.value !== 'all' && spanCategory(span.op) !== category.value) continue
    if (
      query &&
      !`${span.name} ${span.op} ${JSON.stringify(span.attributes)}`.toLowerCase().includes(query)
    )
      continue
    let current: Span | undefined = span
    const visited = new Set<string>()
    while (current && !visited.has(current.spanId)) {
      keep.add(current.spanId)
      visited.add(current.spanId)
      current = current.parentSpanId ? byId.get(current.parentSpanId) : undefined
    }
  }
  return rows.value.filter(({ span }) => {
    if (filtering) return keep.has(span.spanId)
    let parent = span.parentSpanId
    const visited = new Set<string>()
    while (parent && !visited.has(parent)) {
      if (collapsed.value.has(parent)) return false
      visited.add(parent)
      parent = byId.get(parent)?.parentSpanId
    }
    return true
  })
})
function toggleBranch(spanId: string) {
  const next = new Set(collapsed.value)
  if (next.has(spanId)) next.delete(spanId)
  else next.add(spanId)
  collapsed.value = next
}
function vitalsLoaded(samples: VitalSample[]) {
  if (!samples.length) {
    vitalSamples.value = []
    return
  }
  const merged = new Map(vitalSamples.value.map((sample) => [sample.pageViewId, sample]))
  for (const sample of samples) merged.set(sample.pageViewId, sample)
  vitalSamples.value = [...merged.values()]
}
const markers = computed(() =>
  projectAccess.canRoute('project-web-vitals') ? traceVitalMarkers(vitalSamples.value) : [],
)
const tab = ref<'waterfall' | 'metrics'>(route.query?.tab === 'metrics' ? 'metrics' : 'waterfall')
let preferMetrics = route.query?.tab === 'metrics'
function selectTab(value: string) {
  preferMetrics = false
  tab.value = value === 'metrics' ? 'metrics' : 'waterfall'
}
function metricsLoaded(total: number) {
  if (preferMetrics) {
    preferMetrics = false
    if (!total && tab.value === 'metrics') tab.value = 'waterfall'
  }
}
const targetSpanId = ref(typeof route.query?.spanId === 'string' ? route.query.spanId : '')
const targetMissing = computed(
  () => targetSpanId.value && !spans.value.some((s) => s.spanId === targetSpanId.value),
)
const waterfall = ref<HTMLElement>()
async function selectTarget() {
  const target = spans.value.find((s) => s.spanId === targetSpanId.value)
  if (target) {
    if (!visibleRows.value.some((row) => row.span.spanId === target.spanId)) {
      search.value = ''
      category.value = 'all'
      const expanded = new Set(collapsed.value)
      const byId = new Map(spans.value.map((span) => [span.spanId, span]))
      const visited = new Set<string>()
      let parent = target.parentSpanId
      while (parent && !visited.has(parent)) {
        visited.add(parent)
        expanded.delete(parent)
        parent = byId.get(parent)?.parentSpanId
      }
      collapsed.value = expanded
    }
    selected.value = target
    await nextTick()
    waterfall.value?.querySelector('.is-selected')?.scrollIntoView?.({ block: 'nearest' })
  }
}
function selectMetricSpan(spanId: string) {
  targetSpanId.value = spanId
  tab.value = 'waterfall'
  void selectTarget()
  if (targetMissing.value && hasMore.value && !loading.value) void load(true)
}
const highlights = computed<TraceFilter[]>(() => {
  try {
    const value: unknown = JSON.parse(String(route.query?.highlight ?? '[]'))
    return Array.isArray(value)
      ? value.filter((f): f is TraceFilter =>
          Boolean(
            f &&
            typeof f === 'object' &&
            typeof f.field === 'string' &&
            typeof f.operator === 'string',
          ),
        )
      : []
  } catch {
    return []
  }
})
const origin = computed(() =>
  spans.value.length ? Math.min(...spans.value.map((s) => Date.parse(s.startTime))) : 0,
)
const spanExtent = computed(() =>
  Math.max(1, Math.max(...spans.value.map((s) => new Date(s.endTime).getTime())) - origin.value),
)
const extent = computed(() =>
  Math.max(spanExtent.value, ...markers.value.map((marker) => marker.at - origin.value)),
)
function markerLeft(at: number) {
  return `${Math.max(0, Math.min(100, ((at - origin.value) / extent.value) * 100))}%`
}
function bar(span: Span) {
  const left = Math.max(
    0,
    ((new Date(span.startTime).getTime() - origin.value) / extent.value) * 100,
  )
  const width = Math.max(
    0.2,
    ((new Date(span.endTime).getTime() - new Date(span.startTime).getTime()) / extent.value) * 100,
  )
  return { left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }
}
function formatDuration(value: number) {
  return value >= 1000
    ? `${(value / 1000).toLocaleString('en-US', { maximumFractionDigits: 2 })} s`
    : `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ms`
}
function spanColor(span: Span) {
  if (span.status === 'error' || span.status === 'deadline_exceeded') return '#e05260'
  if (span.op.startsWith('http')) return '#3b9c92'
  if (span.op.startsWith('resource.')) return '#e98166'
  if (span.op.startsWith('browser.')) return '#a16bd0'
  if (span.op === 'pageload' || span.op === 'navigation') return '#7c6cda'
  return '#5b8def'
}
function propertyValue(value: unknown, key: string) {
  if (value == null) return '—'
  if (key === 'durationMs' && typeof value === 'number') return formatDuration(value)
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value, null, 2) ?? '—'
}
let generation = 0
async function load(append = false) {
  const current = ++generation
  loading.value = true
  error.value = ''
  try {
    const result = await traceDetail(
      String(route.params.groupSlug),
      String(route.params.projectSlug),
      String(route.params.traceId),
      append ? cursor.value : undefined,
    )
    if (current !== generation) return
    spans.value = append
      ? [
          ...spans.value,
          ...result.items.filter((s) => !spans.value.some((old) => old.spanId === s.spanId)),
        ]
      : result.items
    hasMore.value = result.hasMore
    cursor.value = result.nextCursor
    if (!selected.value) selected.value = spans.value[0] ?? null
    await selectTarget()
  } catch {
    if (current === generation) error.value = 'Unable to load trace'
  } finally {
    if (current === generation) loading.value = false
  }
  if (current === generation && !error.value && targetMissing.value && hasMore.value)
    await load(true)
}
watch(
  () => route.query?.spanId,
  (value) => {
    targetSpanId.value = typeof value === 'string' ? value : ''
    if (targetSpanId.value) selectMetricSpan(targetSpanId.value)
  },
)
watch(
  [() => route.params.groupSlug, () => route.params.projectSlug, () => route.params.traceId],
  () => {
    spans.value = []
    vitalSamples.value = []
    search.value = ''
    category.value = 'all'
    collapsed.value = new Set()
    selected.value = null
    hasMore.value = false
    cursor.value = undefined
    preferMetrics = route.query?.tab === 'metrics'
    tab.value = preferMetrics ? 'metrics' : 'waterfall'
    targetSpanId.value = typeof route.query?.spanId === 'string' ? route.query.spanId : ''
    void load()
  },
)
onMounted(() => load())
onBeforeUnmount(() => {
  generation++
})
</script>
<template>
  <section class="trace-detail space-y-5">
    <RouterLink
      class="back-link"
      :to="{
        name: 'project-traces',
        params: { groupSlug: route.params.groupSlug, projectSlug: route.params.projectSlug },
      }"
    >
      <ArrowLeft class="size-4" /> Back to Traces
    </RouterLink>
    <div class="trace-heading">
      <div class="min-w-0">
        <h2 class="page-title">Trace details</h2>
        <p class="trace-id">{{ route.params.traceId }}</p>
      </div>
      <div class="trace-summary">
        <span><Layers class="size-4" /> {{ spans.length }} spans</span>
        <span><Clock3 class="size-4" /> {{ spans.length ? formatDuration(spanExtent) : '—' }}</span>
      </div>
    </div>
    <nav class="flex gap-4 border-b" aria-label="Trace detail views">
      <button
        v-for="item in [
          { id: 'waterfall', label: 'Waterfall' },
          { id: 'metrics', label: 'Application Metrics' },
        ]"
        :key="item.id"
        class="border-b-2 px-1 py-2 text-sm"
        :class="
          tab === item.id
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground'
        "
        :aria-pressed="tab === item.id"
        @click="selectTab(item.id)"
      >
        {{ item.label }}
      </button>
    </nav>
    <p v-if="loading" role="status" class="text-sm text-muted-foreground">Loading…</p>
    <div v-if="error" role="alert">
      {{ error }} <Button variant="outline" @click="load(Boolean(spans.length))">Retry</Button>
    </div>
    <p v-if="hasMore" role="status" class="trace-notice">
      This trace is not fully loaded. Parent spans may appear on later pages.
    </p>
    <p v-if="rows.some((r) => r.missingParent)" class="trace-notice">
      Some parent spans are remote, uncollected, or not yet loaded. Orphan spans are shown
      separately.
    </p>
    <p v-if="spans.some((s) => s.truncated || s.droppedSpanCount > 0)" class="trace-notice">
      This trace contains truncated records or dropped child spans and may be incomplete.
    </p>
    <EmptyState
      v-if="!loading && !error && !spans.length"
      class="rounded-lg border bg-background p-8"
      title="No retained records for this trace."
      description="It may be unsampled, pending ingestion, or expired. Related metrics are still available in Application Metrics."
    />
    <p v-if="targetMissing" role="status" class="trace-notice">
      {{
        hasMore
          ? 'Looking for the target span…'
          : 'The target span is not retained. It may not have been collected or may have expired.'
      }}
    </p>
    <TraceWebVitalsPanel
      v-if="projectAccess.canRoute('project-web-vitals')"
      :group="String(route.params.groupSlug)"
      :project="String(route.params.projectSlug)"
      :trace-id="String(route.params.traceId)"
      @loaded="vitalsLoaded"
    />
    <TraceMetricsPanel
      v-if="tab === 'metrics' && projectAccess.canRoute('project-metrics')"
      :group="String(route.params.groupSlug)"
      :project="String(route.params.projectSlug)"
      :trace-id="String(route.params.traceId)"
      :selected-span-id="selected?.spanId"
      @select-span="selectMetricSpan"
      @loaded="metricsLoaded"
    />
    <div v-show="tab === 'waterfall'" ref="waterfall" class="detail-grid">
      <div class="waterfall-panel">
        <div class="waterfall-title">
          <GitBranch class="size-4" /> Trace timeline
          <span>Select a span to view its attributes</span>
        </div>
        <div class="flex flex-wrap items-center gap-3 border-b p-3">
          <input
            v-model="search"
            type="search"
            aria-label="Search in trace"
            placeholder="Search in trace"
            class="min-w-40 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
          />
          <select
            v-model="category"
            aria-label="Span type"
            class="rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="all">All span types</option>
            <option value="resource">Static resources</option>
            <option value="browser">Browser phases</option>
            <option value="http">HTTP requests</option>
            <option value="operation">Operations</option>
          </select>
          <Button v-if="collapsed.size" variant="outline" size="sm" @click="collapsed = new Set()"
            >Expand all</Button
          >
        </div>
        <div
          v-if="markers.length && spans.length"
          class="waterfall-row vital-marker-row"
          aria-label="Web Vitals timeline markers"
        >
          <span class="px-4 text-xs text-muted-foreground">Paint milestones</span>
          <span class="relative h-12">
            <span
              v-for="marker in markers"
              :key="marker.key"
              class="vital-marker"
              :style="{ left: markerLeft(marker.at) }"
              :title="`${marker.name}: ${formatVital(marker.name, marker.value)}`"
              :aria-label="`${marker.name} at ${formatVital(marker.name, marker.value)}`"
            >
              <span>{{ marker.name }}</span>
            </span>
          </span>
          <span />
        </div>
        <div class="waterfall-axis waterfall-row">
          <span class="px-4">Operation / Span</span>
          <span class="axis-ticks"
            ><span v-for="tick in [0, 0.25, 0.5, 0.75, 1]" :key="tick">{{
              formatDuration(extent * tick)
            }}</span></span
          >
          <span class="duration-cell">Duration</span>
        </div>
        <div class="waterfall-body">
          <div v-for="row in visibleRows" :key="row.span.spanId" class="relative">
            <button
              v-if="childParents.has(row.span.spanId)"
              type="button"
              class="branch-toggle"
              :style="{ left: `${8 + Math.min(row.depth, 6) * 14}px` }"
              :aria-label="`${collapsed.has(row.span.spanId) ? 'Expand' : 'Collapse'} ${row.span.name}`"
              :aria-expanded="
                !collapsed.has(row.span.spanId) || Boolean(search.trim() || category !== 'all')
              "
              @click="toggleBranch(row.span.spanId)"
            >
              <ChevronRight
                class="size-3"
                :class="{
                  'rotate-90':
                    !collapsed.has(row.span.spanId) || search.trim() || category !== 'all',
                }"
              />
            </button>
            <button
              class="waterfall-row span-row"
              :class="{
                'is-selected': selected?.spanId === row.span.spanId,
                'is-highlighted': highlights.length > 0 && matchesSpanFilters(row.span, highlights),
              }"
              :aria-pressed="selected?.spanId === row.span.spanId"
              :aria-label="`View span ${row.span.name}`"
              @click="selectMetricSpan(row.span.spanId)"
            >
              <span
                class="span-label"
                :style="{ paddingLeft: `${28 + Math.min(row.depth, 6) * 14}px` }"
              >
                <span v-if="row.depth" class="tree-connector" aria-hidden="true" />
                <span class="op-dot" :style="{ background: spanColor(row.span) }" />
                <span class="span-text">
                  <span class="span-name" :title="row.span.name">{{ row.span.name }}</span>
                  <span class="span-op"
                    >{{ row.span.op }} {{ row.missingParent ? 'Missing parent' : '' }}
                    {{ row.span.truncated ? 'Truncated' : '' }}</span
                  >
                </span>
              </span>
              <span class="timeline-cell">
                <span
                  v-for="marker in markers"
                  :key="marker.key"
                  class="timeline-milestone"
                  :style="{ left: markerLeft(marker.at) }"
                  aria-hidden="true"
                />
                <span
                  class="timeline-bar"
                  :style="{ ...bar(row.span), background: spanColor(row.span) }"
                />
              </span>
              <span class="duration-cell">{{ formatDuration(row.span.durationMs) }}</span>
            </button>
          </div>
          <p
            v-if="spans.length && !visibleRows.length"
            class="p-10 text-center text-muted-foreground"
          >
            No spans match your search.
          </p>
          <p v-if="!loading && !spans.length" class="p-10 text-center text-muted-foreground">
            No trace spans
          </p>
        </div>
        <div class="waterfall-footer">
          Loaded {{ spans.length }} spans · Showing {{ visibleRows.length }}
          {{ hasMore ? '(more pages available)' : '(all retained records)' }}
        </div>
      </div>
      <aside v-if="selected" class="span-panel">
        <div class="span-panel-heading">
          <h3 class="font-semibold">Span attributes</h3>
          <span
            class="status-badge"
            :class="{
              'status-error':
                selected.status === 'error' || selected.status === 'deadline_exceeded',
            }"
            >{{ selected.status }}</span
          >
        </div>
        <p class="selected-name">{{ selected.name }}</p>
        <section
          v-if="selected.op.startsWith('resource.')"
          class="mt-4"
          aria-label="Resource details"
        >
          <h4 class="text-sm font-semibold">Resource details</h4>
          <dl class="properties">
            <div v-for="item in resourceDetails(selected)" :key="item.label" class="property">
              <dt>{{ item.label }}</dt>
              <dd>{{ item.value }}</dd>
            </div>
          </dl>
          <p
            v-if="selected.attributes['resource.timing_available'] === false"
            class="mt-3 text-xs text-muted-foreground"
          >
            Detailed timing and sizes are unavailable. Cross-origin resources may require a
            Timing-Allow-Origin response header.
          </p>
        </section>
        <dl class="properties">
          <div v-for="(value, key) in selected" :key="key" class="property">
            <dt>{{ key }}</dt>
            <dd>{{ propertyValue(value, key) }}</dd>
          </div>
        </dl>
      </aside>
    </div>
    <Button v-if="hasMore && tab === 'waterfall'" :disabled="loading" @click="load(true)"
      >Load more spans</Button
    >
  </section>
</template>
<style scoped>
.trace-detail {
  min-width: 0;
}
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--muted-foreground);
}
.back-link:hover {
  color: var(--foreground);
}
.trace-heading {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}
.trace-id {
  margin-top: 0.375rem;
  font-size: 0.75rem;
  font-family: monospace;
  color: var(--muted-foreground);
  overflow-wrap: anywhere;
}
.trace-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  color: var(--muted-foreground);
  font-size: 0.875rem;
}
.trace-summary > span {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.trace-notice {
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  background: var(--muted);
}
.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 300px);
  gap: 1.25rem;
  align-items: start;
}
.waterfall-panel,
.span-panel {
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--background);
}
.waterfall-panel {
  overflow: hidden;
}
.waterfall-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  border-bottom: 1px solid var(--border);
}
.waterfall-title > span {
  margin-left: auto;
  color: var(--muted-foreground);
  font-size: 0.75rem;
  font-weight: 400;
}
.waterfall-row {
  display: grid;
  grid-template-columns: minmax(0, 38%) minmax(0, 1fr) 76px;
  width: 100%;
  min-width: 0;
}
.waterfall-axis {
  background: var(--muted);
  align-items: center;
  min-height: 42px;
  font-size: 0.6875rem;
  color: var(--muted-foreground);
  border-bottom: 1px solid var(--border);
}
.axis-ticks {
  display: flex;
  justify-content: space-between;
  min-width: 0;
  gap: 0.25rem;
  padding: 0 0.75rem;
}
.axis-ticks > span {
  white-space: nowrap;
}
.waterfall-body {
  min-height: 300px;
}
.branch-toggle {
  position: absolute;
  top: 15px;
  z-index: 2;
  padding: 3px;
  cursor: pointer;
  border-radius: 3px;
}
.branch-toggle:focus-visible {
  outline: 2px solid var(--ring);
}
.vital-marker-row {
  align-items: center;
  border-bottom: 1px solid var(--border);
}
.vital-marker {
  position: absolute;
  top: 0;
  bottom: 0;
  border-left: 1px dashed #d18c12;
}
.vital-marker > span {
  position: absolute;
  bottom: 3px;
  right: 2px;
  color: #926009;
  font-size: 10px;
  background: var(--background);
}
.vital-marker:nth-child(even) > span {
  bottom: 22px;
}
.timeline-milestone {
  position: absolute;
  top: 0;
  bottom: 0;
  border-left: 1px dashed #d18c1266;
  pointer-events: none;
}
.span-row {
  text-align: left;
  border-bottom: 1px solid var(--border);
  transition: background 0.15s;
  cursor: pointer;
  align-items: stretch;
}
.span-row:hover {
  background: var(--muted);
}
.span-row.is-selected {
  background: color-mix(in srgb, #5b8def 9%, var(--background));
  box-shadow: inset 3px 0 #5b8def;
}
.span-row.is-highlighted {
  box-shadow: inset 3px 0 var(--primary);
}
.span-row:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: -2px;
}
.span-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  padding: 0.75rem 0.5rem;
  position: relative;
}
.tree-connector {
  position: absolute;
  left: 12px;
  top: 0;
  width: 12px;
  height: 50%;
  border-left: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.op-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.span-text {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}
.span-name {
  font-size: 0.8125rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.span-op {
  color: var(--muted-foreground);
  font-size: 0.6875rem;
  overflow-wrap: anywhere;
}
.timeline-cell {
  position: relative;
  min-width: 0;
  border-left: 1px solid var(--border);
  background-image: linear-gradient(to right, var(--border) 1px, transparent 1px);
  background-size: 25% 100%;
}
.timeline-bar {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  height: 14px;
  min-width: 2px;
  max-width: 100%;
  border-radius: 3px;
  opacity: 0.85;
}
.duration-cell {
  padding: 0.75rem 0.5rem;
  font-size: 0.6875rem;
  text-align: right;
  align-self: center;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.waterfall-footer {
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--border);
  color: var(--muted-foreground);
  font-size: 0.75rem;
}
.span-panel {
  padding: 1rem;
  max-height: 720px;
  overflow-y: auto;
  overflow-x: hidden;
}
.span-panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.status-badge {
  border-radius: 0.375rem;
  padding: 0.2rem 0.5rem;
  font-size: 0.6875rem;
  color: #238377;
  background: #3b9c9214;
}
.status-error {
  color: #c33b4a;
  background: #e0526014;
}
.selected-name {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.properties {
  margin-top: 1rem;
}
.property {
  padding: 0.625rem 0;
  border-top: 1px solid var(--border);
  min-width: 0;
}
.property dt {
  font-size: 0.6875rem;
  color: var(--muted-foreground);
}
.property dd {
  margin-top: 0.25rem;
  font-size: 0.75rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 1100px) {
  .detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 640px) {
  .waterfall-row {
    grid-template-columns: minmax(0, 45%) minmax(0, 1fr) 60px;
  }
  .axis-ticks > span:nth-child(2),
  .axis-ticks > span:nth-child(4) {
    display: none;
  }
  .axis-ticks {
    padding: 0 0.25rem;
    font-size: 0.5625rem;
  }
  .span-label {
    gap: 0.25rem;
  }
  .duration-cell {
    padding: 0.5rem 0.25rem;
  }
}
</style>

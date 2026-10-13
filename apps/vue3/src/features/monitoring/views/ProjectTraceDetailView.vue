<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ArrowLeft, GitBranch, Clock3, Layers } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { traceDetail } from '../api/traces.api'
import { waterfallRows, matchesSpanFilters } from '../model/traces'
import type { Span, TraceFilter } from '../model/traces'
const route = useRoute(),
  spans = ref<Span[]>([]),
  selected = ref<Span | null>(null),
  hasMore = ref(false),
  cursor = ref<string>(),
  loading = ref(false),
  error = ref('')
const rows = computed(() => waterfallRows(spans.value))
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
const extent = computed(() =>
  Math.max(1, Math.max(...spans.value.map((s) => new Date(s.endTime).getTime())) - origin.value),
)
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
    ? `${(value / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} s`
    : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ms`
}
function spanColor(span: Span) {
  if (span.status === 'error' || span.status === 'deadline_exceeded') return '#e05260'
  if (span.op.startsWith('http')) return '#3b9c92'
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
  } catch {
    if (current === generation) error.value = '无法加载 Trace'
  } finally {
    if (current === generation) loading.value = false
  }
}
watch(
  [() => route.params.groupSlug, () => route.params.projectSlug, () => route.params.traceId],
  () => {
    spans.value = []
    selected.value = null
    hasMore.value = false
    cursor.value = undefined
    void load()
  },
)
onMounted(() => load())
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
      <ArrowLeft class="size-4" /> 返回 Traces
    </RouterLink>
    <div class="trace-heading">
      <div class="min-w-0">
        <h2 class="text-xl font-semibold">Trace 详情</h2>
        <p class="trace-id">{{ route.params.traceId }}</p>
      </div>
      <div class="trace-summary">
        <span><Layers class="size-4" /> {{ spans.length }} spans</span>
        <span><Clock3 class="size-4" /> {{ spans.length ? formatDuration(extent) : '—' }}</span>
      </div>
    </div>
    <p v-if="loading" role="status" class="text-sm text-muted-foreground">加载中…</p>
    <div v-if="error" role="alert">
      {{ error }} <Button variant="outline" @click="load(Boolean(spans.length))">重试</Button>
    </div>
    <p v-if="hasMore" role="status" class="trace-notice">
      链路尚未加载完整；分页中的父节点可能暂未出现。
    </p>
    <p v-if="rows.some((r) => r.missingParent)" class="trace-notice">
      存在缺失父节点（远程、未采集或尚未加载）；孤立节点独立展示。
    </p>
    <p v-if="spans.some((s) => s.truncated || s.droppedSpanCount > 0)" class="trace-notice">
      此链路含截断记录或丢弃的子 spans，无法保证完整性。
    </p>
    <div class="detail-grid">
      <div class="waterfall-panel">
        <div class="waterfall-title">
          <GitBranch class="size-4" /> 链路时间线 <span>点击操作查看属性</span>
        </div>
        <div class="waterfall-axis waterfall-row">
          <span class="px-4">操作 / Span</span>
          <span class="axis-ticks"
            ><span v-for="tick in [0, 0.25, 0.5, 0.75, 1]" :key="tick">{{
              formatDuration(extent * tick)
            }}</span></span
          >
          <span class="duration-cell">耗时</span>
        </div>
        <div class="waterfall-body">
          <button
            v-for="row in rows"
            :key="row.span.spanId"
            class="waterfall-row span-row"
            :class="{
              'is-selected': selected?.spanId === row.span.spanId,
              'is-highlighted': highlights.length > 0 && matchesSpanFilters(row.span, highlights),
            }"
            :aria-pressed="selected?.spanId === row.span.spanId"
            :aria-label="`查看 Span ${row.span.name}`"
            @click="selected = row.span"
          >
            <span
              class="span-label"
              :style="{ paddingLeft: `${16 + Math.min(row.depth, 6) * 14}px` }"
            >
              <span v-if="row.depth" class="tree-connector" aria-hidden="true" />
              <span class="op-dot" :style="{ background: spanColor(row.span) }" />
              <span class="span-text">
                <span class="span-name" :title="row.span.name">{{ row.span.name }}</span>
                <span class="span-op"
                  >{{ row.span.op }} {{ row.missingParent ? '缺失父节点' : '' }}
                  {{ row.span.truncated ? '截断' : '' }}</span
                >
              </span>
            </span>
            <span class="timeline-cell">
              <span
                class="timeline-bar"
                :style="{ ...bar(row.span), background: spanColor(row.span) }"
              />
            </span>
            <span class="duration-cell">{{ formatDuration(row.span.durationMs) }}</span>
          </button>
          <p v-if="!loading && !spans.length" class="p-10 text-center text-muted-foreground">
            暂无 Trace spans
          </p>
        </div>
        <div class="waterfall-footer">
          已加载 {{ spans.length }} 个 spans {{ hasMore ? '（分页未结束）' : '（全部已保留记录）' }}
        </div>
      </div>
      <aside v-if="selected" class="span-panel">
        <div class="span-panel-heading">
          <h3 class="font-semibold">Span 属性</h3>
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
        <dl class="properties">
          <div v-for="(value, key) in selected" :key="key" class="property">
            <dt>{{ key }}</dt>
            <dd>{{ propertyValue(value, key) }}</dd>
          </div>
        </dl>
      </aside>
    </div>
    <Button v-if="hasMore" :disabled="loading" @click="load(true)">加载更多 spans</Button>
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

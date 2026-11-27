<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { AlertCircle, ExternalLink } from '@lucide/vue'
import { translate } from '@/i18n'
import { Button } from '@/components/ui/button'
import { traceDetail } from '../api/traces.api'
import { useProjectAccessStore } from '../model/project-access.store'
import { waterfallRows, type Span } from '../model/traces'
import type { BrowserEventContexts } from '../model/types'

const props = defineProps<{
  groupSlug: string
  projectSlug: string
  trace?: BrowserEventContexts['trace']
}>()
const access = useProjectAccessStore()
const allowed = computed(() => access.canRoute('project-trace-detail'))
const spans = ref<Span[]>([])
const navigationSpanId = ref<string>()
const loading = ref(false)
const failed = ref(false)
const hasMore = ref(false)
let generation = 0
const target = (spanId = props.trace?.spanId) => ({
  name: 'project-trace-detail',
  params: {
    groupSlug: props.groupSlug,
    projectSlug: props.projectSlug,
    traceId: props.trace?.traceId,
  },
  query: { ...(spanId ? { spanId } : {}), tab: 'waterfall' },
})
const rows = computed(() => waterfallRows(spans.value, navigationSpanId.value))
const previewRows = computed(() => {
  if (rows.value.length <= 8) return rows.value
  const byId = new Map(spans.value.map((span) => [span.spanId, span]))
  const ancestors: string[] = []
  let current = props.trace?.spanId
  while (current && !ancestors.includes(current)) {
    ancestors.push(current)
    current = byId.get(current)?.parentSpanId ?? undefined
  }
  const keep = new Set(ancestors.slice(0, 7))
  if (rows.value[0]) keep.add(rows.value[0].span.spanId)
  for (const { span } of rows.value) {
    if (keep.size >= 8) break
    keep.add(span.spanId)
  }
  return rows.value.filter((row) => keep.has(row.span.spanId))
})
const origin = computed(() => Math.min(...spans.value.map((span) => Date.parse(span.startTime))))
const extent = computed(() =>
  Math.max(1, ...spans.value.map((span) => Date.parse(span.endTime) - origin.value)),
)
const errorCount = computed(() =>
  Math.max(
    1,
    spans.value.reduce((sum, span) => sum + (span.errorCount ?? 0), 0),
  ),
)
const targetMissing = computed(
  () => spans.value.length && !spans.value.some((span) => span.spanId === props.trace?.spanId),
)
function hasError(span: Span) {
  return (
    span.spanId === props.trace?.spanId ||
    (span.errorCount ?? 0) > 0 ||
    span.status === 'error' ||
    span.status === 'deadline_exceeded'
  )
}
function bar(span: Span) {
  const left = Math.max(
    0,
    Math.min(100, ((Date.parse(span.startTime) - origin.value) / extent.value) * 100),
  )
  const width = Math.max(0.5, (span.durationMs / extent.value) * 100)
  return { left: `${left}%`, width: `${Math.min(100 - left, width)}%` }
}
function duration(value: number) {
  return `${Number(value.toFixed(2))} ms`
}
async function load() {
  const current = ++generation
  spans.value = []
  navigationSpanId.value = undefined
  failed.value = false
  hasMore.value = false
  loading.value = false
  if (!props.trace || !props.trace.sampled || !allowed.value) return
  loading.value = true
  try {
    const result = await traceDetail(
      props.groupSlug,
      props.projectSlug,
      props.trace.traceId,
      undefined,
      props.trace.spanId,
    )
    if (current !== generation) return
    spans.value = result.items
    navigationSpanId.value = result.navigationSpanId
    hasMore.value = result.hasMore
  } catch {
    if (current === generation) failed.value = true
  } finally {
    if (current === generation) loading.value = false
  }
}
watch(
  () => [
    props.groupSlug,
    props.projectSlug,
    props.trace?.traceId,
    props.trace?.spanId,
    props.trace?.sampled,
    allowed.value,
  ],
  load,
  { immediate: true },
)
onBeforeUnmount(() => {
  generation++
})
</script>

<template>
  <section
    class="trace-preview rounded-xl border bg-card text-card-foreground"
    :aria-label="translate('Trace Preview')"
  >
    <details open>
      <summary class="cursor-pointer px-5 py-4 text-sm font-semibold">
        {{ translate('Trace Preview') }}
      </summary>
      <div class="space-y-3 px-5 pb-5">
        <template v-if="trace">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="flex min-w-0 items-center gap-2 text-sm text-destructive">
              <span class="error-count">{{ errorCount }}</span>
              <span class="break-all font-mono text-xs">Trace — {{ trace.traceId }}</span>
            </p>
            <RouterLink
              v-if="allowed && trace.sampled"
              :to="target()"
              class="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              {{ translate('View Full Trace') }} <ExternalLink :size="12" />
            </RouterLink>
          </div>
          <p v-if="!allowed" role="status" class="text-sm text-muted-foreground">
            {{ translate('You do not have permission to view this trace.') }}
          </p>
          <p v-else-if="!trace.sampled" role="status" class="text-sm text-muted-foreground">
            {{ translate('This trace was not sampled.') }}
          </p>
          <p v-else-if="loading" role="status" class="text-sm text-muted-foreground">
            {{ translate('Loading trace preview…') }}
          </p>
          <div
            v-else-if="failed"
            role="alert"
            class="flex items-center gap-3 text-sm text-destructive"
          >
            {{ translate('Unable to load trace preview') }}
            <Button
              variant="outline"
              size="sm"
              :aria-label="translate('Retry trace preview')"
              @click="load"
              >{{ translate('Retry') }}</Button
            >
          </div>
          <template v-else-if="spans.length">
            <div class="overflow-x-auto rounded-md border">
              <div class="preview-grid preview-axis text-muted-foreground">
                <span>{{ translate('Span') }}</span>
                <span class="flex justify-between text-[10px]"
                  ><span v-for="tick in [0, 1, 2, 3, 4]" :key="tick">{{
                    duration((extent * tick) / 4)
                  }}</span></span
                >
                <span class="text-right">{{ translate('Duration') }}</span>
              </div>
              <RouterLink
                v-for="row in previewRows"
                :key="row.span.spanId"
                :to="target(row.span.spanId)"
                class="preview-grid preview-row"
                :class="{ 'has-error': hasError(row.span) }"
                :data-span-id="row.span.spanId"
              >
                <span
                  class="flex min-w-0 items-center gap-2"
                  :style="{ paddingLeft: `${Math.min(row.depth, 5) * 14}px` }"
                >
                  <span v-if="row.depth" class="text-muted-foreground" aria-hidden="true">└</span>
                  <AlertCircle
                    v-if="hasError(row.span)"
                    :size="14"
                    class="shrink-0"
                    :aria-label="translate('Error span')"
                  />
                  <span v-else class="h-2 w-2 shrink-0 rounded-sm bg-emerald-500" />
                  <span class="truncate" :title="`${row.span.op} — ${row.span.name}`"
                    ><strong>{{ row.span.op }}</strong> — {{ row.span.name }}</span
                  >
                </span>
                <span class="preview-timeline"
                  ><span class="preview-bar" :style="bar(row.span)"
                /></span>
                <span class="text-right font-mono text-[11px]">{{
                  duration(row.span.durationMs)
                }}</span>
              </RouterLink>
            </div>
            <p v-if="targetMissing" role="status" class="text-xs text-muted-foreground">
              {{
                translate(
                  'The error span is not in this preview. Open the full trace to locate it.',
                )
              }}
            </p>
            <p
              v-if="hasMore || rows.length > previewRows.length"
              class="text-xs text-muted-foreground"
            >
              {{ translate('Showing a trace preview. Open the full trace for all spans.') }}
            </p>
          </template>
          <p v-else role="status" class="text-sm text-muted-foreground">
            {{
              translate(
                'Trace spans are unavailable. They may not have arrived yet or may have expired.',
              )
            }}
          </p>
        </template>
        <p v-else role="status" class="text-sm text-muted-foreground">
          {{ translate('This error has no associated trace.') }}
        </p>
      </div>
    </details>
  </section>
</template>

<style scoped>
.preview-grid {
  display: grid;
  grid-template-columns: minmax(220px, 42%) minmax(240px, 1fr) 82px;
  align-items: center;
  gap: 12px;
  padding: 7px 12px;
  min-width: 650px;
  font-size: 12px;
}
.preview-axis {
  background: var(--muted);
  font-size: 11px;
}
.preview-row {
  border-top: 1px solid var(--border);
}
.preview-row:hover {
  background: color-mix(in srgb, var(--muted) 65%, transparent);
}
.has-error {
  color: var(--destructive);
  background: color-mix(in srgb, var(--destructive) 5%, transparent);
}
.preview-timeline {
  position: relative;
  height: 20px;
  background: repeating-linear-gradient(
    to right,
    transparent 0,
    transparent calc(25% - 1px),
    var(--border) calc(25% - 1px),
    var(--border) 25%
  );
}
.preview-bar {
  position: absolute;
  top: 3px;
  height: 14px;
  min-width: 2px;
  border-radius: 2px;
  background: #7c6cda;
}
.has-error .preview-bar {
  background: repeating-linear-gradient(135deg, #e05260 0, #e05260 3px, #c52f40 3px, #c52f40 5px);
}
.error-count {
  border: 1px solid currentColor;
  border-radius: 999px;
  padding: 0 6px;
  font-size: 11px;
}
</style>

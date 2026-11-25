<script setup lang="ts">
import { translate } from '@/i18n'

import EmptyState from '@/components/ui/empty-state/EmptyState.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import type { ProfileSegment } from '../model/profiles'
import { profileFlamegraph, type FlameFrame } from '../model/profile-flamegraph'
import { profileFlameLabels } from '../model/profile-flame-labels'
const props = defineProps<{ segments: ProfileSegment[]; durationMs: number }>()
const search = ref('')
const selected = ref<ProfileSegment | null>(null)
const chart = ref<HTMLElement>()
const hover = ref('')
const mode = ref<'tree' | 'timeline'>('timeline')
const rowLimit = ref(200)
const sampled = computed(() => props.segments.filter((s) => s.frameId != null))
const sampledMs = computed(() => {
  const intervals = sampled.value.slice().sort((a, b) => a.start - b.start)
  let total = 0
  let previousEnd = 0
  for (const s of intervals) {
    const finish = Math.min(props.durationMs, s.end)
    total += Math.max(0, finish - Math.max(previousEnd, s.start, 0))
    previousEnd = Math.max(previousEnd, finish)
  }
  return total
})
const percent = (ms: number) =>
  props.durationMs > 0 ? ((ms / props.durationMs) * 100).toFixed(1) : '0.0'
const visible = computed(() =>
  props.segments.filter(
    (s) =>
      s.frameId != null &&
      !!s.name.trim() &&
      Number((Math.min(props.durationMs, s.end) - Math.max(0, s.start)).toFixed(2)) > 0,
  ),
)
const start = computed(() =>
  visible.value.length
    ? Math.max(
        0,
        visible.value.reduce((min, s) => Math.min(min, s.start), props.durationMs),
      )
    : 0,
)
const end = computed(() =>
  Math.min(
    props.durationMs,
    visible.value.reduce((max, s) => Math.max(max, s.end), 0),
  ),
)
const flame = computed(() => profileFlamegraph(visible.value, props.durationMs))
// One row per named function. Union recursive intervals before averaging.
const functionRows = computed(() => {
  const groups = new Map<
    string,
    { name: string; segment: ProfileSegment; intervals: { start: number; end: number }[] }
  >()
  for (const segment of visible.value) {
    const name = segment.name.trim()
    if (segment.frameId == null || !name) continue
    let group = groups.get(name)
    if (!group) {
      group = { name, segment, intervals: [] }
      groups.set(name, group)
    }
    if (segment.end - segment.start > group.segment.end - group.segment.start)
      group.segment = segment
    group.intervals.push({
      start: Math.max(start.value, segment.start),
      end: Math.min(end.value, segment.end),
    })
  }
  return [...groups.values()]
    .map((group) => {
      const intervals: { start: number; end: number }[] = []
      for (const interval of group.intervals.sort((a, b) => a.start - b.start || b.end - a.end)) {
        const last = intervals[intervals.length - 1]
        if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end)
        else intervals.push({ ...interval })
      }
      const totalMs = intervals.reduce(
        (total, interval) => total + interval.end - interval.start,
        0,
      )
      return {
        name: group.name,
        segment: group.segment,
        count: intervals.length,
        totalMs,
        averageMs: totalMs / intervals.length,
      }
    })
    .sort((a, b) => b.totalMs - a.totalMs || a.name.localeCompare(b.name))
})
const tree = computed(() =>
  functionRows.value.filter((row) =>
    row.name.toLowerCase().includes(search.value.trim().toLowerCase()),
  ),
)
const selectedSummary = computed(() =>
  mode.value === 'tree' && selected.value
    ? functionRows.value.find((row) => row.name === selected.value!.name.trim())
    : flame.value.frames.find((frame) => selected.value && frame.segments.includes(selected.value)),
)
const chartWidth = ref(800)
let measuringContext: CanvasRenderingContext2D | null | undefined
function measureLabel(text: string) {
  if (typeof CanvasRenderingContext2D !== 'undefined') {
    measuringContext ??= document.createElement('canvas').getContext('2d')
    if (measuringContext) {
      measuringContext.font = '12px monospace'
      return measuringContext.measureText(text).width
    }
  }
  return Array.from(text).reduce(
    (width, char) => width + (char.codePointAt(0)! > 255 ? 12 : 7.25),
    0,
  )
}
const diagram = computed(() =>
  profileFlameLabels(flame.value.frames, flame.value.duration, chartWidth.value, measureLabel),
)
const choices = computed(() => {
  const seen = new Set<string>()
  return visible.value.filter((segment) => {
    const name = segment.name.trim()
    if (seen.has(name)) return false
    seen.add(name)
    return true
  })
})
function inspect(frame: FlameFrame) {
  hover.value = `${frame.name} · ${frame.totalMs.toFixed(2)} ms · ${translate('Sampled intervals')}: ${frame.count}`
}
let observer: ResizeObserver | undefined
function resize() {
  chartWidth.value = Math.max(240, chart.value?.clientWidth || 800)
}
watch(
  () => props.segments,
  () => {
    hover.value = ''
    selected.value = null
    rowLimit.value = 200
  },
)
watch(search, () => {
  rowLimit.value = 200
})
watch(chart, (el) => {
  observer?.disconnect()
  if (el) observer?.observe(el)
  resize()
})
onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(resize)
    if (chart.value) observer.observe(chart.value)
  }
  resize()
})
onBeforeUnmount(() => observer?.disconnect())
</script>
<template>
  <section
    class="space-y-3 rounded-lg border bg-background p-4"
    :aria-label="translate('Profile flame chart')"
  >
    <div class="grid gap-3 sm:grid-cols-3">
      <div class="rounded-lg border bg-muted/20 p-3">
        <p class="text-xs text-muted-foreground">{{ translate('Capture duration') }}</p>
        <p class="mt-1 text-xl font-semibold tabular-nums">
          {{ durationMs.toFixed(2) }} <span class="text-xs font-normal">ms</span>
        </p>
      </div>
      <div data-testid="sampling-coverage" class="rounded-lg border bg-blue-500/5 p-3">
        <p class="text-xs text-muted-foreground">{{ translate('Sampled coverage') }}</p>
        <p class="mt-1 text-xl font-semibold tabular-nums">
          {{ percent(sampledMs) }}%
          <span class="text-xs font-normal text-muted-foreground"
            >· {{ sampledMs.toFixed(2) }} ms</span
          >
        </p>
      </div>
      <div class="rounded-lg border bg-muted/20 p-3">
        <p class="text-xs text-muted-foreground">{{ translate('Unsampled') }}</p>
        <p class="mt-1 text-xl font-semibold tabular-nums">
          {{ Math.max(0, durationMs - sampledMs).toFixed(2) }}
          <span class="text-xs font-normal">ms</span>
        </p>
      </div>
    </div>
    <p class="rounded-md bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
      {{
        translate(
          'Unsampled time has no usable function stack. It may include waiting, idle time or sampling gaps; it cannot be assigned to a business function.',
        )
      }}
    </p>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-1 flex-wrap items-center gap-2">
        <div class="flex rounded-md border p-1" :aria-label="translate('Profile view')">
          <Button
            data-view="tree"
            size="sm"
            :variant="mode === 'tree' ? 'secondary' : 'ghost'"
            :aria-pressed="mode === 'tree'"
            @click="mode = 'tree'"
            >{{ translate('Call tree') }}</Button
          >
          <Button
            data-view="timeline"
            size="sm"
            :variant="mode === 'timeline' ? 'secondary' : 'ghost'"
            :aria-pressed="mode === 'timeline'"
            @click="mode = 'timeline'"
            >{{ translate('Flame chart') }}</Button
          >
        </div>
        <input
          v-model="search"
          :aria-label="translate('Find frames')"
          :placeholder="translate('Find frames…')"
          class="h-8 min-w-32 flex-1 rounded border bg-background px-3 text-xs"
        />
      </div>
    </div>
    <p class="text-xs text-muted-foreground">
      {{
        translate(
          mode === 'tree'
            ? 'Named functions are merged across stack levels. Counts represent sampled intervals, not exact invocation counts.'
            : 'Calls are aggregated by stack path with idle gaps removed. Width shows accumulated sampled time. Click a function to inspect details.',
        )
      }}
    </p>
    <div v-if="mode === 'timeline' && visible.length" class="space-y-3">
      <div class="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span
          ><span class="mr-1 inline-block h-2 w-2 rounded-sm bg-indigo-200" />{{
            translate('Sampled calls')
          }}</span
        >
      </div>
      <div data-time-range class="flex justify-between text-xs tabular-nums text-muted-foreground">
        <span v-for="tick in 5" :key="tick"
          >{{ ((flame.duration * (tick - 1)) / 4).toFixed(2) }} ms</span
        >
      </div>
    </div>
    <EmptyState v-if="!segments.length" class="py-8" :title="translate('No samples recorded')" />
    <div v-else class="grid overflow-hidden rounded border lg:grid-cols-[minmax(0,1fr)_240px]">
      <div v-if="mode === 'tree'" class="max-h-[480px] min-w-0 overflow-auto">
        <div class="min-w-[480px]">
          <div
            class="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_80px_110px_110px] gap-3 border-b bg-muted px-4 py-3 text-xs font-medium text-muted-foreground"
          >
            <span>{{ translate('Function') }}</span
            ><span class="text-right">{{ translate('Sampled intervals') }}</span>
            <span class="text-right">{{ translate('Average duration') }}</span>
            <span class="text-right">{{ translate('Sampled time') }}</span>
          </div>
          <button
            v-for="row in tree.slice(0, rowLimit)"
            :key="row.name"
            data-call-row
            type="button"
            class="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_80px_110px_110px] items-center gap-3 border-b px-4 py-2 text-left text-xs last:border-0 hover:bg-muted/30 focus-visible:outline-2"
            :class="selectedSummary?.name === row.name ? 'bg-primary/5' : ''"
            :aria-pressed="selectedSummary?.name === row.name"
            @click="selected = row.segment"
          >
            <span
              :data-select-call="row.segment.frameId"
              class="min-w-0 py-1 font-mono leading-relaxed break-all"
              >{{ row.name }}</span
            >
            <span data-interval-count class="text-right font-mono tabular-nums">{{
              row.count
            }}</span>
            <span data-average-duration class="text-right font-mono tabular-nums"
              >{{ row.averageMs.toFixed(2) }} ms</span
            >
            <span data-total-duration class="text-right font-mono tabular-nums"
              >{{ row.totalMs.toFixed(2) }} ms</span
            >
          </button>
          <p v-if="!tree.length" class="p-8 text-center text-sm text-muted-foreground">
            {{
              translate(search.trim() ? 'No matching function calls' : 'No sampled function calls')
            }}
          </p>
          <Button
            v-if="tree.length > rowLimit"
            variant="ghost"
            class="m-3"
            @click="rowLimit += 200"
            >{{ translate('Show more calls') }}</Button
          >
        </div>
      </div>
      <div v-else-if="visible.length" ref="chart" class="max-h-[480px] min-w-0 overflow-auto">
        <svg
          data-flame-chart
          :width="chartWidth"
          :height="diagram.height"
          :viewBox="`0 0 ${chartWidth} ${diagram.height}`"
          :aria-label="translate('Profile flame chart')"
          class="block"
        >
          <g
            v-for="item in diagram.items"
            :key="item.index"
            data-flame-frame
            role="button"
            tabindex="0"
            :aria-label="item.frame.name"
            :aria-pressed="!!selected && item.frame.segments.includes(selected)"
            class="cursor-pointer focus-visible:outline-2"
            @click="selected = item.frame.segment"
            @keydown.enter.prevent="selected = item.frame.segment"
            @keydown.space.prevent="selected = item.frame.segment"
            @mouseenter="inspect(item.frame)"
            @mouseleave="hover = ''"
          >
            <title>{{ item.frame.name }} · {{ item.frame.totalMs.toFixed(2) }} ms</title>
            <rect
              :x="item.x"
              :y="item.y"
              :width="Math.max(0.5, item.width - 1)"
              :height="29"
              :fill="
                search.trim() &&
                !item.frame.name.toLowerCase().includes(search.trim().toLowerCase())
                  ? '#e4e4e7'
                  : ['#bfdbfe', '#c7d2fe', '#ddd6fe', '#a5f3fc'][item.frame.depth % 4]
              "
              :stroke="
                selected && item.frame.segments.includes(selected) ? '#7c3aed' : 'transparent'
              "
              stroke-width="2"
            />
            <template v-if="item.label.outside">
              <line
                :x1="item.x + item.width / 2"
                :y1="item.y + 29"
                :x2="
                  Math.max(
                    item.label.x + 6,
                    Math.min(item.label.x + item.label.width - 6, item.x + item.width / 2),
                  )
                "
                :y2="item.label.y"
                stroke="#64748b"
              />
              <rect
                :x="item.label.x"
                :y="item.label.y"
                :width="item.label.width"
                :height="item.label.height"
                rx="3"
                fill="var(--background)"
                stroke="var(--border)"
              />
            </template>
            <text
              data-flame-label
              class="pointer-events-none fill-foreground font-mono text-[12px]"
            >
              <tspan
                v-for="(line, index) in item.label.lines"
                :key="index"
                :x="item.label.x + 6"
                :y="item.label.y + (item.label.outside ? 18 : 19) + index * 16"
              >
                {{ line }}
              </tspan>
            </text>
          </g>
        </svg>
      </div>
      <p v-else class="p-8 text-center text-sm text-muted-foreground">
        {{ translate('No sampled function calls') }}
      </p>
      <aside
        class="space-y-4 border-t bg-muted/10 p-4 text-xs lg:border-l lg:border-t-0"
        :aria-label="translate('Selected function')"
      >
        <h3 class="font-semibold">{{ translate('Function') }}</h3>
        <template v-if="selected">
          <dl class="space-y-3">
            <div>
              <dt class="text-muted-foreground">{{ translate('Name') }}</dt>
              <dd class="mt-1 break-all font-mono">
                {{ selected.frameId == null ? translate('Unsampled') : selected.name.trim() }}
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground">
                {{ translate(selectedSummary ? 'Representative source' : 'Source') }}
              </dt>
              <dd class="mt-1 break-all">
                {{ selected.resource ?? translate('Unknown resource') }}
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground">
                {{ translate(selected.frameId == null ? 'Unsampled' : 'Sampled time') }}
              </dt>
              <dd class="mt-1">
                {{ (selectedSummary?.totalMs ?? selected.end - selected.start).toFixed(2) }}
                {{ translate('ms') }}
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground">{{ translate('Capture share') }}</dt>
              <dd class="mt-1">
                {{ percent(selectedSummary?.totalMs ?? selected.end - selected.start) }}%
              </dd>
            </div>
            <div v-if="!selectedSummary">
              <dt class="text-muted-foreground">{{ translate('Time interval') }}</dt>
              <dd class="mt-1 tabular-nums">
                {{ selected.start.toFixed(2) }}–{{ selected.end.toFixed(2) }} ms
              </dd>
            </div>
            <template v-if="selectedSummary">
              <div>
                <dt class="text-muted-foreground">{{ translate('Sampled intervals') }}</dt>
                <dd class="mt-1">{{ selectedSummary.count }}</dd>
              </div>
              <div>
                <dt class="text-muted-foreground">{{ translate('Average duration') }}</dt>
                <dd class="mt-1">{{ selectedSummary.averageMs.toFixed(2) }} ms</dd>
              </div>
            </template>
          </dl>
          <p class="leading-relaxed text-muted-foreground">
            {{
              translate(
                'Intervals are estimates from samples, not precise CPU time. Parent intervals include child calls; percentages must not be added together.',
              )
            }}
          </p>
        </template>
        <p v-else class="text-muted-foreground">
          {{ translate('Select a frame to inspect its function and source.') }}
        </p>
      </aside>
    </div>
    <p class="min-h-4 break-all text-xs text-muted-foreground" role="status">
      {{ hover }}
    </p>
    <details v-if="choices.length">
      <summary class="cursor-pointer text-xs text-muted-foreground">
        {{ translate('Select function (keyboard accessible)') }}
      </summary>
      <div class="mt-2 flex max-h-32 flex-wrap gap-1 overflow-y-auto">
        <button
          v-for="segment in choices"
          :key="segment.frameId"
          data-frame
          class="max-w-60 truncate rounded border px-2 py-1 text-xs hover:bg-muted focus-visible:outline-2"
          :title="segment.name"
          @click="selected = segment"
        >
          {{ segment.name.trim() }}
        </button>
      </div>
    </details>
  </section>
</template>

<script setup lang="ts">
import { translate } from '@/i18n'

import EmptyState from '@/components/ui/empty-state/EmptyState.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import type { ProfileSegment } from '../model/profiles'
import { profileFlamegraph, profileFlameGroups, type FlameFrame } from '../model/profile-flamegraph'
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
const flame = computed(() => profileFlamegraph(visible.value, props.durationMs))
const collapsed = ref(new Set<number>())
const callRows = computed(() => {
  const parents: number[] = []
  let branch = -1
  const rows = flame.value.frames.map((frame, index) => {
    while (parents.length && flame.value.frames[parents[parents.length - 1]!]!.depth >= frame.depth)
      parents.pop()
    const parent = parents[parents.length - 1]
    if (parent == null) branch++
    parents.push(index)
    return { ...frame, index, parent, branch, children: false }
  })
  for (const row of rows) if (row.parent != null) rows[row.parent]!.children = true
  return rows
})
const treeWidth = computed(() =>
  Math.max(640, ...callRows.value.map((row) => row.depth * 16 + 500)),
)
const tree = computed(() => {
  const query = search.value.trim().toLowerCase()
  const matches = new Set<number>()
  if (query)
    for (const row of callRows.value) {
      if (!row.name.toLowerCase().includes(query)) continue
      let index: number | undefined = row.index
      while (index != null && !matches.has(index)) {
        matches.add(index)
        index = callRows.value[index]!.parent
      }
    }
  const hidden = new Set<number>()
  return callRows.value.filter((row) => {
    if (query) return matches.has(row.index)
    if (row.parent != null && (hidden.has(row.parent) || collapsed.value.has(row.parent))) {
      hidden.add(row.index)
      return false
    }
    return true
  })
})
function toggle(index: number) {
  const next = new Set(collapsed.value)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  collapsed.value = next
}
const selectedSummary = computed(() =>
  flame.value.frames.find((frame) => selected.value && frame.segments.includes(selected.value)),
)
const chartWidth = ref(800)
const flamePlotWidth = computed(() => Math.max(240, chartWidth.value - 32))
const branchColors = [
  'var(--color-violet-400, #a78bfa)',
  'var(--color-sky-400, #38bdf8)',
  'var(--color-teal-400, #2dd4bf)',
  'var(--color-amber-400, #fbbf24)',
]
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
const flameGroups = computed(() =>
  profileFlameGroups(flame.value).map((group) => ({
    ...group,
    diagram: profileFlameLabels(group.frames, group.duration, flamePlotWidth.value, measureLabel),
  })),
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
    collapsed.value = new Set()
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
            ? 'Only named calls are shown in their parent-child hierarchy. Expand branches to follow the stack.'
            : 'Grouped by root function. Each group uses its own scale; compare groups using sampled time and global share.',
        )
      }}
    </p>
    <div v-if="mode === 'tree' && visible.length" class="flex flex-wrap gap-2">
      <Button data-expand-all variant="outline" size="sm" @click="collapsed = new Set()">{{
        translate('Expand all calls')
      }}</Button>
      <Button
        data-collapse-roots
        variant="outline"
        size="sm"
        @click="
          collapsed = new Set(
            callRows.filter((row) => row.parent == null && row.children).map((row) => row.index),
          )
        "
        >{{ translate('Collapse root branches') }}</Button
      >
    </div>
    <EmptyState v-if="!segments.length" class="py-8" :title="translate('No samples recorded')" />
    <div v-else class="grid overflow-hidden rounded border lg:grid-cols-[minmax(0,1fr)_240px]">
      <div v-if="mode === 'tree'" class="max-h-[480px] min-w-0 overflow-auto">
        <div :style="{ minWidth: `${treeWidth}px` }">
          <div
            class="sticky top-0 z-10 grid grid-cols-[minmax(240px,1fr)_minmax(160px,1.2fr)_90px] items-center gap-4 border-b bg-muted px-4 py-3 text-xs font-medium text-muted-foreground"
          >
            <span>{{ translate('Function / call hierarchy') }}</span>
            <span data-tree-axis class="flex justify-between font-mono tabular-nums"
              ><span>0</span><span>{{ (flame.duration / 2).toFixed(2) }}</span
              ><span>{{ flame.duration.toFixed(2) }} ms</span></span
            >
            <span class="text-right">{{ translate('Sampled time') }}</span>
          </div>
          <div
            v-for="row in tree.slice(0, rowLimit)"
            :key="row.index"
            data-call-row
            :data-depth="row.depth"
            class="grid w-full grid-cols-[minmax(240px,1fr)_minmax(160px,1.2fr)_90px] items-center gap-4 border-b px-4 py-2 text-left text-xs last:border-0 hover:bg-muted/30"
            :class="selected && row.segments.includes(selected) ? 'bg-primary/5' : ''"
          >
            <div
              class="flex min-w-0 items-center gap-1"
              :style="{ paddingLeft: `${row.depth * 16}px` }"
            >
              <button
                v-if="row.children"
                data-toggle-call
                type="button"
                class="size-6 shrink-0 cursor-pointer rounded hover:bg-muted focus-visible:outline-2"
                :aria-expanded="!collapsed.has(row.index) || !!search.trim()"
                :aria-label="translate('Toggle child calls for {name}', { name: row.name })"
                @click="toggle(row.index)"
              >
                {{ collapsed.has(row.index) && !search.trim() ? '▸' : '▾' }}
              </button>
              <span v-else class="w-6 shrink-0" aria-hidden="true" />
              <span
                v-if="row.parent == null"
                class="size-2 shrink-0 rounded-full"
                :class="row.branch % 2 ? 'bg-teal-500' : 'bg-violet-500'"
                aria-hidden="true"
              />
              <button
                :data-select-call="row.segment.frameId"
                type="button"
                class="min-w-0 cursor-pointer rounded py-1 text-left font-mono leading-relaxed break-all hover:text-primary focus-visible:outline-2"
                :aria-pressed="!!selected && row.segments.includes(selected)"
                @click="selected = row.segment"
              >
                {{ row.name }}
              </button>
            </div>
            <button
              type="button"
              class="relative h-4 w-full cursor-pointer overflow-hidden rounded-sm bg-muted focus-visible:outline-2"
              :aria-label="translate('View sampled time for {name}', { name: row.name })"
              @click="selected = row.segment"
            >
              <span
                data-tree-duration-bar
                class="absolute inset-y-0 rounded-sm"
                :class="row.branch % 2 ? 'bg-teal-400/60' : 'bg-violet-400/60'"
                :style="{
                  left: `${flame.duration > 0 ? (row.start / flame.duration) * 100 : 0}%`,
                  width: `${flame.duration > 0 ? (row.totalMs / flame.duration) * 100 : 0}%`,
                }"
              />
            </button>
            <span data-total-duration class="text-right font-mono tabular-nums"
              >{{ row.totalMs.toFixed(2) }} ms</span
            >
          </div>
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
      <div v-else-if="visible.length" ref="chart" class="max-h-[640px] min-w-0 overflow-auto">
        <div data-flame-overview class="space-y-3 border-b p-4">
          <div class="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{{ translate('Named sampled time') }}</span
            ><span class="font-mono tabular-nums">{{ flame.duration.toFixed(2) }} ms</span>
          </div>
          <div class="flex h-2 overflow-hidden rounded-sm bg-muted" aria-hidden="true">
            <span
              v-for="group in flameGroups"
              :key="group.index"
              :style="{
                width: `${group.sharePercent}%`,
                background: branchColors[group.index % branchColors.length],
              }"
            />
          </div>
          <div class="flex flex-wrap gap-x-5 gap-y-2 text-xs">
            <span
              v-for="group in flameGroups"
              :key="group.index"
              class="inline-flex min-w-0 items-start gap-2"
            >
              <span
                class="mt-1 size-2 shrink-0 rounded-full"
                :style="{ background: branchColors[group.index % branchColors.length] }"
                aria-hidden="true"
              />
              <span class="break-all font-mono">{{ group.root.name }}</span
              ><span class="shrink-0 tabular-nums text-muted-foreground"
                >{{ group.sharePercent.toFixed(1) }}%</span
              >
            </span>
          </div>
        </div>
        <section
          v-for="group in flameGroups"
          :key="group.index"
          data-flame-group
          class="space-y-3 border-b p-4 last:border-b-0"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <h3 data-flame-group-name class="min-w-0 break-all font-mono text-sm font-semibold">
              {{ group.root.name }}
            </h3>
            <div class="flex shrink-0 items-center gap-3 text-xs tabular-nums">
              <span class="font-mono">{{ group.duration.toFixed(2) }} ms</span>
              <span data-flame-group-share class="text-muted-foreground"
                >{{ translate('Global share') }} {{ group.sharePercent.toFixed(1) }}%</span
              >
            </div>
          </div>
          <p v-if="group.root.segment.resource" class="break-all text-xs text-muted-foreground">
            {{ group.root.segment.resource }}
          </p>
          <div
            data-time-range
            class="flex justify-between text-xs font-mono tabular-nums text-muted-foreground"
            :style="{ width: `${flamePlotWidth}px` }"
          >
            <span>0.00 ms</span><span>{{ (group.duration / 2).toFixed(2) }} ms</span
            ><span>{{ group.duration.toFixed(2) }} ms</span>
          </div>
          <svg
            data-flame-chart
            :width="flamePlotWidth"
            :height="group.diagram.height"
            :viewBox="`0 0 ${flamePlotWidth} ${group.diagram.height}`"
            :aria-label="translate('Profile flame chart')"
            class="block"
          >
            <g
              v-for="item in group.diagram.items"
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
                    : `color-mix(in srgb, ${branchColors[group.index % branchColors.length]} ${24 + (item.frame.depth % 3) * 5}%, var(--background))`
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
        </section>
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

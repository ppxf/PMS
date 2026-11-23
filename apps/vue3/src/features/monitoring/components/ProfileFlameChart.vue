<script setup lang="ts">
import { locale, translate } from '@/i18n'

import EmptyState from '@/components/ui/empty-state/EmptyState.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'
import { Button } from '@/components/ui/button'
import type { ProfileSegment } from '../model/profiles'
const props = defineProps<{ segments: ProfileSegment[]; durationMs: number }>()
const search = ref('')
const selected = ref<ProfileSegment | null>(null)
const canvas = ref<HTMLCanvasElement>()
const focus = ref<ProfileSegment | null>(null)
const hover = ref('')
const mode = ref<'tree' | 'timeline'>('tree')
const sampledOnly = ref(false)
const collapsed = ref(new Set<ProfileSegment>())
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
const sampledStart = computed(() =>
  sampled.value.reduce((min, s) => Math.min(min, s.start), props.durationMs),
)
const sampledEnd = computed(() => sampled.value.reduce((max, s) => Math.max(max, s.end), 0))
const start = computed(() => focus.value?.start ?? (sampledOnly.value ? sampledStart.value : 0))
const end = computed(
  () => focus.value?.end ?? (sampledOnly.value ? sampledEnd.value : props.durationMs),
)
const depth = computed(() => focus.value?.depth ?? 0)
const visible = computed(() =>
  props.segments.filter(
    (s) => s.depth >= depth.value && s.end > start.value && s.start < end.value,
  ),
)
// Flatten in chronological, parent-first order; retain ancestors when searching.
const tree = computed(() => {
  const ordered = visible.value
    .filter((s) => s.frameId != null)
    .slice()
    .sort((a, b) => a.start - b.start || a.depth - b.depth || b.end - a.end)
  const parents: number[] = []
  const rows = ordered.map((segment, index) => {
    while (parents.length) {
      const parent = ordered[parents[parents.length - 1]!]!
      if (
        parent.depth < segment.depth &&
        parent.start <= segment.start &&
        parent.end >= segment.end
      )
        break
      parents.pop()
    }
    const parent = parents[parents.length - 1]
    parents.push(index)
    return { segment, index, parent, children: false }
  })
  for (const row of rows) if (row.parent != null) rows[row.parent]!.children = true
  const query = search.value.trim().toLowerCase()
  const matches = new Set<number>()
  if (query)
    for (const row of rows) {
      if (!row.segment.name.toLowerCase().includes(query)) continue
      let index: number | undefined = row.index
      while (index != null && !matches.has(index)) {
        matches.add(index)
        index = rows[index]!.parent
      }
    }
  const hidden = new Set<number>()
  return rows.filter((row) => {
    if (query) return matches.has(row.index)
    if (
      row.parent != null &&
      (hidden.has(row.parent) || collapsed.value.has(rows[row.parent]!.segment))
    ) {
      hidden.add(row.index)
      return false
    }
    return true
  })
})
function toggle(segment: ProfileSegment) {
  const next = new Set(collapsed.value)
  if (next.has(segment)) next.delete(segment)
  else next.add(segment)
  collapsed.value = next
}
function reset() {
  focus.value = null
  sampledOnly.value = false
}
function focusSampled() {
  focus.value = null
  sampledOnly.value = true
}
function focusCall(segment: ProfileSegment) {
  focus.value = segment
  selected.value = segment
}
function focusSelected() {
  if (!selected.value) return
  focusCall(selected.value)
  mode.value = 'timeline'
}
const rowHeight = 32
const height = computed(() =>
  Math.max(
    80,
    (visible.value.reduce((max, s) => Math.max(max, s.depth - depth.value), 0) + 1) * rowHeight,
  ),
)
// Canvas keeps the DOM bounded even for 10,000 distinct samples and deep stacks.
const choices = computed(() => {
  const seen = new Set<number>()
  return visible.value.filter((s) => {
    if (s.frameId == null || seen.has(s.frameId)) return false
    seen.add(s.frameId)
    return true
  })
})
let observer: ResizeObserver | undefined
function draw() {
  const el = canvas.value
  if (!el || typeof CanvasRenderingContext2D === 'undefined') return
  const context = el.getContext('2d')
  if (!context) return
  const width = Math.max(1, el.clientWidth)
  const ratio = window.devicePixelRatio || 1
  el.width = width * ratio
  el.height = height.value * ratio
  context.scale(ratio, ratio)
  context.font = '12px sans-serif'
  const duration = end.value - start.value || 1
  // Vertical time guides make horizontal position easier to read.
  context.strokeStyle = '#94a3b833'
  for (let tick = 0; tick <= 4; tick++) {
    context.beginPath()
    context.moveTo((width * tick) / 4, 0)
    context.lineTo((width * tick) / 4, height.value)
    context.stroke()
  }
  for (const segment of visible.value) {
    const x = ((Math.max(start.value, segment.start) - start.value) / duration) * width
    const w =
      ((Math.min(end.value, segment.end) - Math.max(start.value, segment.start)) / duration) * width
    const y = (segment.depth - depth.value) * rowHeight
    context.fillStyle =
      search.value && !segment.name.toLowerCase().includes(search.value.toLowerCase())
        ? '#e4e4e7'
        : segment.frameId == null
          ? '#e2e8f0'
          : ['#bfdbfe', '#c7d2fe', '#ddd6fe', '#a5f3fc'][segment.depth % 4]!
    context.fillRect(x, y, Math.max(w - 1, 0.5), rowHeight - 3)
    if (w > 30) {
      context.save()
      context.beginPath()
      context.rect(x + 3, y, Math.max(0, w - 6), rowHeight - 3)
      context.clip()
      context.fillStyle = '#172033'
      const label = segment.frameId == null ? translate('Unsampled') : segment.name
      context.fillText(`${label} · ${(segment.end - segment.start).toFixed(2)} ms`, x + 6, y + 19)
      context.restore()
    }
  }
}
function hit(event: MouseEvent) {
  const el = canvas.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const time = start.value + ((event.clientX - rect.left) / rect.width) * (end.value - start.value)
  const row = Math.floor((event.clientY - rect.top) / rowHeight) + depth.value
  return visible.value.find((s) => s.depth === row && s.start <= time && s.end > time)
}
function select(event: MouseEvent) {
  const segment = hit(event)
  if (segment) {
    selected.value = segment
    focus.value = segment
  }
}
function inspect(event: MouseEvent) {
  const s = hit(event)
  hover.value = s
    ? `${s.frameId == null ? translate('Unsampled') : s.name} · ${s.start.toFixed(2)}–${s.end.toFixed(2)} ms · ${(s.end - s.start).toFixed(2)} ms`
    : ''
}
watch(
  () => props.segments,
  () => {
    focus.value = null
    hover.value = ''
    selected.value = null
    sampledOnly.value = false
    collapsed.value = new Set()
    rowLimit.value = 200
  },
)
watch([visible, height, search, mode, locale], () => {
  void nextTick(draw)
})
watch(search, () => {
  rowLimit.value = 200
})
watch(canvas, (el) => {
  observer?.disconnect()
  if (el) observer?.observe(el)
  void nextTick(draw)
})
onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(draw)
    if (canvas.value) observer.observe(canvas.value)
  }
  draw()
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
      <Button
        :aria-label="translate('Reset flame chart')"
        variant="outline"
        size="sm"
        :disabled="!focus && !sampledOnly"
        @click="reset"
        >{{ translate('Reset focus') }}</Button
      >
    </div>
    <p class="text-xs text-muted-foreground">
      {{
        translate(
          focus
            ? `Focused: ${focus.name}`
            : mode === 'tree'
              ? 'Expand calls to follow the stack. Select a function to inspect its details.'
              : 'Width shows sampled interval; rows show call depth. Click a frame to zoom in.',
        )
      }}
    </p>
    <div v-if="mode === 'timeline'" class="space-y-3">
      <div class="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span
          ><span class="mr-1 inline-block h-2 w-2 rounded-sm bg-indigo-200" />{{
            translate('Sampled calls')
          }}</span
        >
        <span
          ><span class="mr-1 inline-block h-2 w-2 rounded-sm bg-slate-200" />{{
            translate('Unsampled')
          }}</span
        >
        <Button
          data-focus-sampled
          variant="outline"
          size="sm"
          :disabled="!sampled.length"
          @click="focusSampled"
          >{{ translate('Focus sampled range') }}</Button
        >
      </div>
      <div data-time-range class="flex justify-between text-xs tabular-nums text-muted-foreground">
        <span v-for="tick in 5" :key="tick"
          >{{ (start + ((end - start) * (tick - 1)) / 4).toFixed(2) }} ms</span
        >
      </div>
    </div>
    <EmptyState v-if="!segments.length" class="py-8" :title="translate('No samples recorded')" />
    <div v-else class="grid overflow-hidden rounded border lg:grid-cols-[minmax(0,1fr)_240px]">
      <div v-if="mode === 'tree'" class="max-h-[480px] min-w-0 overflow-auto">
        <div class="min-w-[480px]">
          <div
            class="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_90px_110px] gap-3 border-b bg-muted px-4 py-3 text-xs font-medium text-muted-foreground"
          >
            <span>{{ translate('Function') }}</span
            ><span class="text-right">{{ translate('Sampled time') }}</span
            ><span class="text-right">{{ translate('Capture share') }}</span>
          </div>
          <div
            v-for="row in tree.slice(0, rowLimit)"
            :key="row.index"
            data-call-row
            class="grid grid-cols-[minmax(0,1fr)_90px_110px] items-center gap-3 border-b px-4 py-2 text-xs last:border-0 hover:bg-muted/30"
            :class="selected === row.segment ? 'bg-primary/5' : ''"
          >
            <div
              class="flex min-w-0 items-center gap-1"
              :style="{ paddingLeft: `${Math.min(row.segment.depth - depth, 12) * 16}px` }"
            >
              <button
                v-if="row.children"
                data-toggle-call
                class="h-7 w-6 shrink-0 rounded hover:bg-muted focus-visible:outline-2"
                :aria-expanded="!collapsed.has(row.segment) || !!search.trim()"
                :aria-label="translate('Toggle child calls for {name}', { name: row.segment.name })"
                @click="toggle(row.segment)"
              >
                {{ collapsed.has(row.segment) && !search.trim() ? '▸' : '▾' }}
              </button>
              <span v-else class="w-6 shrink-0 text-center text-muted-foreground">·</span>
              <button
                :data-select-call="row.segment.frameId"
                class="min-w-0 rounded py-1 text-left font-mono leading-relaxed break-all hover:text-primary focus-visible:outline-2"
                @click="selected = row.segment"
              >
                {{ row.segment.name }}
              </button>
            </div>
            <span class="text-right font-mono tabular-nums"
              >{{ (row.segment.end - row.segment.start).toFixed(2) }} ms</span
            >
            <div class="space-y-1 text-right tabular-nums">
              <span>{{ percent(row.segment.end - row.segment.start) }}%</span>
              <div class="h-1 rounded-full bg-muted">
                <div
                  class="h-1 rounded-full bg-indigo-400"
                  :style="{
                    width: `${Math.min(100, Number(percent(row.segment.end - row.segment.start)))}%`,
                  }"
                />
              </div>
            </div>
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
      <div v-else class="max-h-[480px] min-w-0 overflow-y-auto">
        <canvas
          ref="canvas"
          class="w-full cursor-pointer"
          :style="{ height: `${height}px` }"
          role="img"
          :aria-label="
            translate(
              'Sampled call stacks over time. Use focus function buttons below for keyboard navigation.',
            )
          "
          @click="select"
          @mousemove="inspect"
          @mouseleave="hover = ''"
        />
      </div>
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
                {{ selected.frameId == null ? translate('Unsampled') : selected.name }}
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground">{{ translate('Source') }}</dt>
              <dd class="mt-1 break-all">
                {{ selected.resource ?? translate('Unknown resource') }}
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground">
                {{ translate(selected.frameId == null ? 'Unsampled' : 'Sampled time') }}
              </dt>
              <dd class="mt-1">
                {{ (selected.end - selected.start).toFixed(2) }} {{ translate('ms') }}
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground">{{ translate('Capture share') }}</dt>
              <dd class="mt-1">{{ percent(selected.end - selected.start) }}%</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">{{ translate('Time interval') }}</dt>
              <dd class="mt-1 tabular-nums">
                {{ selected.start.toFixed(2) }}–{{ selected.end.toFixed(2) }} ms
              </dd>
            </div>
          </dl>
          <Button
            v-if="selected.frameId != null"
            variant="outline"
            size="sm"
            @click="focusSelected"
            >{{ translate('Focus this call') }}</Button
          >
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
        {{ translate('Focus function (keyboard accessible)') }}
      </summary>
      <div class="mt-2 flex max-h-32 flex-wrap gap-1 overflow-y-auto">
        <button
          v-for="segment in choices"
          :key="segment.frameId"
          data-frame
          class="max-w-60 truncate rounded border px-2 py-1 text-xs hover:bg-muted focus-visible:outline-2"
          :title="segment.name"
          @click="focusCall(segment)"
        >
          {{ segment.name }}
        </button>
      </div>
    </details>
  </section>
</template>

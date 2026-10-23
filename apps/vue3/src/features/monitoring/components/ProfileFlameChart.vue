<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'
import { Button } from '@/components/ui/button'
import type { ProfileSegment } from '../model/profiles'
const props = defineProps<{ segments: ProfileSegment[]; durationMs: number }>()
const canvas = ref<HTMLCanvasElement>()
const focus = ref<ProfileSegment | null>(null)
const hover = ref('')
const start = computed(() => focus.value?.start ?? 0)
const end = computed(() => focus.value?.end ?? props.durationMs)
const depth = computed(() => focus.value?.depth ?? 0)
const visible = computed(() =>
  props.segments.filter(
    (s) => s.depth >= depth.value && s.end > start.value && s.start < end.value,
  ),
)
const height = computed(() =>
  Math.max(
    80,
    (visible.value.reduce((max, s) => Math.max(max, s.depth - depth.value), 0) + 1) * 28,
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
  context.font = '11px sans-serif'
  const duration = end.value - start.value || 1
  for (const segment of visible.value) {
    const x = ((Math.max(start.value, segment.start) - start.value) / duration) * width
    const w =
      ((Math.min(end.value, segment.end) - Math.max(start.value, segment.start)) / duration) * width
    const y = (segment.depth - depth.value) * 28
    context.fillStyle =
      segment.frameId == null ? '#cbd5e1' : `hsl(${((segment.frameId + 1) * 47) % 360} 55% 72%)`
    context.fillRect(x, y, Math.max(w - 1, 0.5), 26)
    if (w > 30) {
      context.save()
      context.beginPath()
      context.rect(x + 3, y, Math.max(0, w - 6), 26)
      context.clip()
      context.fillStyle = '#172033'
      context.fillText(segment.name, x + 5, y + 17)
      context.restore()
    }
  }
}
function hit(event: MouseEvent) {
  const el = canvas.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const time = start.value + ((event.clientX - rect.left) / rect.width) * (end.value - start.value)
  const row = Math.floor((event.clientY - rect.top) / 28) + depth.value
  return visible.value.find((s) => s.depth === row && s.start <= time && s.end > time)
}
function select(event: MouseEvent) {
  const segment = hit(event)
  if (segment) focus.value = segment
}
function inspect(event: MouseEvent) {
  const s = hit(event)
  hover.value = s
    ? `${s.name} · ${s.start.toFixed(2)}–${s.end.toFixed(2)} ms · ${(s.end - s.start).toFixed(2)} ms sampled interval`
    : ''
}
watch(
  () => props.segments,
  () => {
    focus.value = null
    hover.value = ''
  },
)
watch([visible, height], () => {
  void nextTick(draw)
})
onMounted(() => {
  if (typeof ResizeObserver !== 'undefined' && canvas.value) {
    observer = new ResizeObserver(draw)
    observer.observe(canvas.value)
  }
  draw()
})
onBeforeUnmount(() => observer?.disconnect())
</script>
<template>
  <section class="space-y-3 rounded-lg border bg-background p-4" aria-label="Profile flame chart">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="font-semibold">Flame chart</h2>
      <Button
        aria-label="Reset flame chart"
        variant="outline"
        size="sm"
        :disabled="!focus"
        @click="focus = null"
        >Reset focus</Button
      >
    </div>
    <p class="text-xs text-muted-foreground">
      {{
        focus
          ? `Focused: ${focus.name}`
          : 'Click a frame to focus its time interval and descendants.'
      }}
    </p>
    <div class="flex justify-between text-xs text-muted-foreground">
      <span>{{ start.toFixed(2) }} ms</span><span>{{ end.toFixed(2) }} ms</span>
    </div>
    <p v-if="!segments.length" class="py-8 text-center text-sm text-muted-foreground">
      No samples recorded
    </p>
    <div v-else class="max-h-[480px] overflow-y-auto">
      <canvas
        ref="canvas"
        class="w-full cursor-pointer"
        :style="{ height: `${height}px` }"
        role="img"
        aria-label="Sampled call stacks over time. Use focus function buttons below for keyboard navigation."
        @click="select"
        @mousemove="inspect"
        @mouseleave="hover = ''"
      />
    </div>
    <p class="min-h-4 break-all text-xs text-muted-foreground" role="status">{{ hover }}</p>
    <details v-if="choices.length">
      <summary class="cursor-pointer text-xs text-muted-foreground">
        Focus function (keyboard accessible)
      </summary>
      <div class="mt-2 flex max-h-32 flex-wrap gap-1 overflow-y-auto">
        <button
          v-for="segment in choices"
          :key="segment.frameId"
          data-frame
          class="max-w-60 truncate rounded border px-2 py-1 text-xs hover:bg-muted focus-visible:outline-2"
          :title="segment.name"
          @click="focus = segment"
        >
          {{ segment.name }}
        </button>
      </div>
    </details>
  </section>
</template>

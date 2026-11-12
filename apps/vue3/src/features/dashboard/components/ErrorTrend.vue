<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useElementSize } from '@vueuse/core'
const props = defineProps<{
  series: { at: string; count: number }[]
  end: string
  range: '24h' | '7d'
}>()
const gradient = useId()
const hovered = ref<number | null>(null)
const container = ref<HTMLElement>()
const { width } = useElementSize(container)
const chartWidth = computed(() => width.value || 784)
const plotWidth = computed(() => Math.max(1, chartWidth.value - 80))
const max = computed(() => Math.max(4, ...props.series.map((p) => p.count)))
const points = computed(() =>
  props.series.map((p, i) => ({
    ...p,
    x: 48 + ((i + 0.5) * plotWidth.value) / Math.max(1, props.series.length),
    y: 198 - (p.count / max.value) * 158,
  })),
)
const line = computed(() => points.value.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' '))
const area = computed(() =>
  points.value.length
    ? `${line.value} L${points.value[points.value.length - 1]!.x},198 L${points.value[0]!.x},198 Z`
    : '',
)
const active = computed(() => (hovered.value === null ? null : points.value[hovered.value]))
const labels = computed(() =>
  [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const start = Date.parse(props.series[0]?.at ?? props.end)
    return {
      x: 48 + f * plotWidth.value,
      value: new Date(start + (Date.parse(props.end) - start) * f).toLocaleString(
        'en-US',
        props.range === '24h'
          ? { hour: '2-digit', minute: '2-digit', hour12: false }
          : { month: 'short', day: 'numeric' },
      ),
    }
  }),
)
</script>

<template>
  <div ref="container" class="relative min-w-0">
    <div
      class="mb-2 flex min-h-6 items-center justify-between gap-2 text-xs text-muted-foreground"
      aria-live="polite"
    >
      <span>{{ range === '24h' ? 'Hourly' : 'Every 6 hours' }} · local time</span>
      <span v-if="active" class="font-medium text-foreground"
        >{{ new Date(active.at).toLocaleString() }} ·
        {{ active.count.toLocaleString() }} events</span
      >
      <span v-else>Hover to inspect</span>
    </div>
    <svg
      :viewBox="`0 0 ${chartWidth} 242`"
      class="block w-full"
      role="img"
      aria-label="Error event trend for the selected period"
      @mouseleave="hovered = null"
    >
      <defs>
        <linearGradient :id="gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="currentColor" stop-opacity="0.14" />
          <stop offset="100%" stop-color="currentColor" stop-opacity="0.01" />
        </linearGradient>
      </defs>
      <g v-for="tick in [0, 1, 2, 3, 4]" :key="tick">
        <line
          x1="48"
          :x2="chartWidth - 32"
          :y1="198 - tick * 39.5"
          :y2="198 - tick * 39.5"
          stroke="currentColor"
          class="text-border"
          stroke-dasharray="3 5"
        />
        <text
          x="34"
          :y="202 - tick * 39.5"
          text-anchor="end"
          class="fill-muted-foreground text-[11px]"
        >
          {{ Math.round((max * tick) / 4) }}
        </text>
      </g>
      <path :d="area" :fill="`url(#${gradient})`" class="text-foreground" />
      <path
        :d="line"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linejoin="round"
        class="text-foreground"
      />
      <g v-if="active">
        <line
          :x1="active.x"
          :x2="active.x"
          y1="32"
          y2="198"
          stroke="currentColor"
          stroke-dasharray="4 4"
          class="text-muted-foreground"
        />
        <circle :cx="active.x" :cy="active.y" r="4" fill="currentColor" class="text-foreground" />
      </g>
      <rect
        v-for="(point, i) in points"
        :key="point.at"
        :x="point.x - plotWidth / (2 * Math.max(1, points.length))"
        y="25"
        :width="plotWidth / Math.max(1, points.length)"
        height="180"
        fill="transparent"
        tabindex="0"
        :aria-label="`${new Date(point.at).toLocaleString()}: ${point.count} events`"
        @mouseenter="hovered = i"
        @focus="hovered = i"
        @blur="hovered = null"
      >
        <title>{{ new Date(point.at).toLocaleString() }}: {{ point.count }} events</title>
      </rect>
      <text
        v-for="label in labels"
        :key="label.x"
        :x="label.x"
        y="226"
        text-anchor="middle"
        class="fill-muted-foreground text-[11px]"
      >
        {{ label.value }}
      </text>
    </svg>
  </div>
</template>

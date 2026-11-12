<script setup lang="ts">
import EmptyState from '@/components/ui/empty-state/EmptyState.vue'
import { computed } from 'vue'
const props = defineProps<{
  series: { at: string; self: number; total: number }[]
  metric: 'self' | 'total'
  aggregation: string
  comparisonStart: string
  comparisonEnd: string
  comparison: boolean
}>()
const chart = computed(() => {
  const start = Date.parse(props.comparisonStart),
    split = Date.parse(props.comparisonEnd)
  const duration = split - start
  const current: number[][] = Array.from({ length: 24 }, () => [])
  const previous: number[][] = Array.from({ length: 24 }, () => [])
  if (duration > 0)
    for (const point of props.series) {
      const time = Date.parse(point.at)
      const baseline = time < split
      const index = Math.floor(((time - (baseline ? start : split)) / duration) * 24)
      if (index >= 0 && index < 24)
        (baseline ? previous : current)[index]!.push(point[props.metric])
    }
  const aggregate = (buckets: number[][]) =>
    buckets.map((bucket) => {
      if (!bucket.length) return null
      bucket.sort((a, b) => a - b)
      if (props.aggregation === 'avg') return bucket.reduce((a, b) => a + b, 0) / bucket.length
      const pos = (bucket.length - 1) * (props.aggregation === 'p50' ? 0.5 : 0.95)
      return (
        bucket[Math.floor(pos)]! + (bucket[Math.ceil(pos)]! - bucket[Math.floor(pos)]!) * (pos % 1)
      )
    })
  const values = aggregate(current),
    baseline = aggregate(previous)
  const max = Math.max(1, ...[...values, ...baseline].filter((v): v is number => v !== null))
  const makePath = (points: (number | null)[]) => {
    let connected = false
    const path = points
      .map((v, i) => {
        if (v === null) {
          connected = false
          return ''
        }
        const command = connected ? 'L' : 'M'
        connected = true
        return `${command}${40 + (i * 460) / 24},${145 - (v / max) * 120}`
      })
      .join(' ')
      .trim()
    return path
  }
  const labels = [0, 4, 8, 12, 16, 20, 24].map((hour) => ({
    x: 40 + (hour / 24) * 460,
    label: new Date(split + (duration * hour) / 24).toLocaleString(
      [],
      duration > 86400000
        ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
        : { hour: '2-digit', minute: '2-digit', hour12: false },
    ),
  }))
  return { path: makePath(values), baselinePath: makePath(baseline), max, labels, values, baseline }
})
</script>
<template>
  <div class="rounded-md border bg-muted/5 px-4 pb-4 pt-5" data-testid="function-trend">
    <svg
      viewBox="0 0 520 180"
      class="w-full"
      role="img"
      aria-label="Function sampled time trend across previous and current periods"
    >
      <g v-for="tick in [0, 1, 2, 3]" :key="tick">
        <line
          x1="40"
          x2="500"
          :y1="145 - tick * 40"
          :y2="145 - tick * 40"
          stroke="currentColor"
          class="text-border"
        />
        <text
          x="35"
          :y="148 - tick * 40"
          text-anchor="end"
          font-size="9"
          fill="currentColor"
          class="text-muted-foreground"
        >
          {{ ((chart.max * tick) / 3).toFixed(0) }}ms
        </text>
      </g>
      <path
        data-testid="baseline-trend"
        :d="chart.baselinePath"
        fill="none"
        stroke="#a1a1aa"
        stroke-width="1.5"
        stroke-dasharray="4 3"
      />
      <path
        data-testid="current-trend"
        :d="chart.path"
        fill="none"
        :stroke="comparison ? '#f36b7f' : '#7770b4'"
        stroke-width="2"
      />
      <circle
        v-for="(v, i) in chart.values"
        v-show="v !== null"
        :key="i"
        :cx="40 + (i * 460) / 24"
        :cy="145 - ((v ?? 0) / chart.max) * 120"
        r="2"
        :fill="comparison ? '#f36b7f' : '#7770b4'"
      >
        <title>{{ v?.toFixed(2) }} ms · bucket {{ i + 1 }}</title>
      </circle>
      <circle
        v-for="(v, i) in chart.baseline"
        v-show="v !== null"
        :key="`baseline-${i}`"
        :cx="40 + (i * 460) / 24"
        :cy="145 - ((v ?? 0) / chart.max) * 120"
        r="2"
        fill="#a1a1aa"
      >
        <title>Previous period · {{ v?.toFixed(2) }} ms</title>
      </circle>
      <text x="44" y="17" font-size="9" fill="#71717a">Previous period</text>
      <text x="285" y="17" font-size="9" fill="#71717a">Current period</text>
      <text
        v-for="(label, i) in chart.labels"
        :key="i"
        :x="label.x"
        y="165"
        :text-anchor="i === 0 ? 'start' : i === 6 ? 'end' : 'middle'"
        font-size="9"
        fill="#71717a"
      >
        {{ label.label }}
      </text>
    </svg>
    <EmptyState v-if="!series.length" class="py-4" title="No trend samples available" />
    <p class="text-right text-[10px] text-muted-foreground">
      {{ aggregation.toUpperCase() }} {{ metric }} time · Gaps indicate no samples
    </p>
  </div>
</template>

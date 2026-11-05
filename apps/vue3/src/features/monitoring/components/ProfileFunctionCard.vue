<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { ChevronLeft, ChevronRight, Search } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import ProfileTrendChart from './ProfileTrendChart.vue'
import FormSelect from '@/components/ui/select/FormSelect.vue'
import type { ProfileDistribution, ProfileFunctionOverview } from '../model/profiles-overview'
import { profileFunctionKind } from '../model/profile-function-scope'
import { PROFILE_DURATION_AGGREGATIONS } from '../model/profiles-overview'

const props = defineProps<{
  functions: ProfileFunctionOverview[]
  initialMode: string
  group: string
  project: string
  loading: boolean
  comparisonStart?: string
  comparisonEnd?: string
  failed: boolean
}>()
const scope = ref('application')
const filtered = computed(() =>
  props.functions.filter((fn) => {
    if (scope.value === 'all') return true
    const kind = profileFunctionKind(fn.resource)
    return kind === 'application' || kind === 'unknown'
  }),
)
const hiddenCount = computed(() => props.functions.length - filtered.value.length)
const expanded = ref<string | null>(null)
const mode = ref(props.initialMode)
const metric = ref<'self' | 'total'>('self')
const page = ref(0)
const modes = [
  ...PROFILE_DURATION_AGGREGATIONS.map((value) => ({
    value,
    label: `Slowest Functions (breakdown by ${value.toUpperCase()})`,
  })),
  { value: 'regressed', label: 'Most Regressed Functions' },
  { value: 'improved', label: 'Most Improved Functions' },
]
const comparison = computed(() => mode.value === 'regressed' || mode.value === 'improved')
const ranked = computed(() => {
  const rows = [...filtered.value]
  if (comparison.value)
    return rows
      .filter(
        (f) =>
          f.changePercent != null &&
          (mode.value === 'regressed' ? f.changePercent > 0 : f.changePercent < 0),
      )
      .sort(
        (a, b) =>
          (mode.value === 'regressed' ? -1 : 1) * (a.changePercent! - b.changePercent!) ||
          a.key.localeCompare(b.key),
      )
  return rows.sort(
    (a, b) =>
      b[metric.value][mode.value as keyof ProfileDistribution] -
        a[metric.value][mode.value as keyof ProfileDistribution] || a.key.localeCompare(b.key),
  )
})
const visible = computed(() => ranked.value.slice(page.value * 5, page.value * 5 + 5))
const value = (f: ProfileFunctionOverview) =>
  comparison.value
    ? Math.abs(f.changePercent!)
    : f[metric.value][mode.value as keyof ProfileDistribution]
watch([mode, metric, scope, () => props.functions], () => {
  page.value = 0
  expanded.value = null
})
</script>

<template>
  <article
    class="flex min-h-[310px] min-w-0 flex-col rounded-lg border bg-background p-4"
    :aria-busy="loading"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <FormSelect
          v-model="mode"
          :aria-label="`${initialMode} function ranking`"
          :options="modes"
          class="h-8 max-w-[390px] border-transparent px-0 text-xs font-semibold shadow-none"
        />
        <div
          v-if="!comparison"
          class="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
        >
          Slowest functions sorted by
          <FormSelect
            v-model="metric"
            aria-label="Function time metric"
            :options="[
              { value: 'self', label: 'self time spent' },
              { value: 'total', label: 'total time spent' },
            ]"
            class="h-7 w-36 text-xs"
          />
        </div>
        <p v-else class="mt-2 text-xs text-muted-foreground">
          P95 self time compared with the previous equal time period.
        </p>
      </div>
      <div class="flex shrink-0">
        <Button
          size="icon"
          variant="outline"
          class="size-7 rounded-r-none"
          :aria-label="`${initialMode} previous functions`"
          :disabled="page === 0 || loading"
          @click="page--"
          ><ChevronLeft class="size-3"
        /></Button>
        <Button
          size="icon"
          variant="outline"
          class="size-7 rounded-l-none"
          :aria-label="`${initialMode} next functions`"
          :disabled="(page + 1) * 5 >= ranked.length || loading"
          @click="page++"
          ><ChevronRight class="size-3"
        /></Button>
      </div>
    </div>
    <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
      <FormSelect
        v-model="scope"
        :aria-label="`${initialMode} function scope`"
        :options="[
          { value: 'application', label: 'Application functions' },
          { value: 'all', label: 'All functions' },
        ]"
        class="h-8 w-44 text-xs"
      />
      <span v-if="hiddenCount" class="text-muted-foreground"
        >{{ hiddenCount }} SDK / dependency functions hidden</span
      >
    </div>
    <p class="mt-2 text-xs text-muted-foreground">
      {{
        scope === 'application'
          ? 'Unknown-source frames remain visible. View All functions to inspect SDK and framework overhead.'
          : 'Includes application, SDK and framework functions.'
      }}
    </p>
    <div
      v-if="loading || failed || !visible.length"
      class="flex flex-1 flex-col items-center justify-center gap-4 py-14 text-center"
    >
      <Search class="size-12 text-muted-foreground/70" :stroke-width="1.5" />
      <p class="text-lg">
        {{
          loading
            ? 'Loading functions…'
            : failed
              ? 'Function statistics unavailable'
              : comparison
                ? mode === 'regressed'
                  ? 'No regressed functions detected'
                  : 'No improved functions detected'
                : 'No functions found'
        }}
      </p>
      <p
        v-if="comparison && !loading && !failed && !visible.length"
        class="max-w-xs text-xs text-muted-foreground"
      >
        Changes require a matching function with non-zero P95 self time in the comparison period.
      </p>
    </div>
    <ol v-else class="mt-3 divide-y border-y">
      <li v-for="fn in visible" :key="fn.key" class="py-4">
        <div class="grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-x-3 text-xs">
          <button
            class="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
            :aria-label="`Toggle trend for ${fn.name}`"
            :aria-expanded="expanded === fn.key || (expanded === null && fn === visible[0])"
            @click="
              expanded =
                expanded === fn.key || (expanded === null && fn === visible[0]) ? '' : fn.key
            "
          >
            {{ expanded === fn.key || (expanded === null && fn === visible[0]) ? '⌄' : '›' }}
          </button>
          <div class="min-w-0 pt-0.5">
            <RouterLink
              class="block truncate font-medium hover:underline"
              :title="fn.name"
              :to="{
                name: 'project-profile-detail',
                params: { groupSlug: group, projectSlug: project, profileId: fn.profileId },
              }"
              >{{ fn.name || '(anonymous)' }}</RouterLink
            >
            <p class="mt-1 truncate text-xs text-muted-foreground" :title="fn.resource">
              {{ fn.resource ?? 'Unknown resource' }}{{ fn.line != null ? `:${fn.line}` : ''
              }}{{ fn.column != null ? `:${fn.column}` : '' }} · {{ fn.count }} profiles
            </p>
          </div>
          <span
            class="min-w-20 pt-0.5 text-right font-mono text-xs tabular-nums"
            :class="comparison ? (fn.changePercent! > 0 ? 'text-red-600' : 'text-emerald-600') : ''"
            >{{
              comparison
                ? `${fn.changePercent! > 0 ? '+' : ''}${fn.changePercent!.toFixed(1)}%`
                : `${value(fn).toFixed(2)} ms`
            }}</span
          >
        </div>
        <ProfileTrendChart
          class="ml-8 mt-6 mb-2"
          v-if="
            (expanded === fn.key || (expanded === null && fn === visible[0])) &&
            comparisonStart &&
            comparisonEnd
          "
          :series="fn.series ?? []"
          :metric="comparison ? 'self' : metric"
          :aggregation="comparison ? 'p95' : mode"
          :comparison="comparison"
          :comparison-start="comparisonStart"
          :comparison-end="comparisonEnd"
        />
      </li>
    </ol>
    <p v-if="visible.length" class="mt-auto pt-3 text-right text-xs text-muted-foreground">
      {{ page * 5 + 1 }}–{{ Math.min((page + 1) * 5, ranked.length) }} of
      {{ ranked.length }} functions
    </p>
  </article>
</template>

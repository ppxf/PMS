<script setup lang="ts">
import { formatDateTime } from '@/lib/date-time'
import EmptyState from '@/components/ui/empty-state/EmptyState.vue'
import TablePagination from '@/components/ui/pagination/TablePagination.vue'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import ProfileFunctionCard from './ProfileFunctionCard.vue'
import ProfileFlameChart from './ProfileFlameChart.vue'
import type { ProfileOverview } from '../model/profiles-overview'
import { PROFILE_DURATION_AGGREGATIONS } from '../model/profiles-overview'

const props = defineProps<{
  overview: ProfileOverview | null
  loading: boolean
  error: string
  group: string
  project: string
}>()
const emit = defineEmits<{ retry: []; inspect: [name: string] }>()
const tab = ref('transactions')
const tabs = [
  { id: 'transactions', label: 'Transactions' },
  { id: 'aggregate', label: 'Aggregate Flamegraph' },
  { id: 'profiles', label: 'Profiles' },
]
function navigateTabs(event: KeyboardEvent, index: number) {
  const offsets: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 }
  const offset = offsets[event.key]
  if (offset == null && event.key !== 'Home' && event.key !== 'End') return
  event.preventDefault()
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (index + offset! + tabs.length) % tabs.length
  tab.value = tabs[next]!.id
  const buttons = (
    event.currentTarget as HTMLElement
  ).parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  buttons?.[next]?.focus()
}
const page = ref(1)
const sort = ref<'name' | 'avg' | 'p50' | 'p95' | 'count'>('count')
const descending = ref(true)
const transactions = computed(() =>
  [...(props.overview?.transactions ?? [])].sort((a, b) => {
    const result =
      sort.value === 'name' ? a.name.localeCompare(b.name) : a[sort.value] - b[sort.value]
    return (descending.value ? -1 : 1) * result || a.name.localeCompare(b.name)
  }),
)
const rows = computed(() => transactions.value.slice((page.value - 1) * 20, page.value * 20))
const columns = [
  { key: 'name', label: 'Transaction' },
  ...PROFILE_DURATION_AGGREGATIONS.map((key) => ({ key, label: key.toUpperCase() })),
  { key: 'count', label: 'Count' },
] as const
function order(key: typeof sort.value) {
  if (sort.value === key) descending.value = !descending.value
  else {
    sort.value = key
    descending.value = key !== 'name'
  }
  page.value = 1
}
watch(
  () => props.overview,
  () => {
    page.value = 1
  },
)
watch(
  () => [props.group, props.project],
  () => {
    tab.value = 'transactions'
  },
)
function inspect(name: string) {
  tab.value = 'profiles'
  emit('inspect', name)
}
</script>

<template>
  <div class="space-y-5">
    <div class="grid gap-4 xl:grid-cols-2">
      <ProfileFunctionCard
        v-for="mode in ['p95', 'regressed']"
        :key="mode"
        :functions="overview?.functions ?? []"
        :initial-mode="mode"
        :group="group"
        :project="project"
        :loading="loading"
        :failed="!!error"
        :comparison-start="overview?.comparisonStart"
        :comparison-end="overview?.comparisonEnd"
      />
    </div>
    <p class="text-xs text-muted-foreground">
      Estimated sampled time · Function percentiles are calculated per profile where the function
      was observed.
      <span v-if="overview"
        >{{ overview.profileCount }} profiles · {{ overview.baselineProfileCount }} comparison
        profiles · Comparison: {{ formatDateTime(overview.comparisonStart) }} –
        {{ formatDateTime(overview.comparisonEnd) }}</span
      >
    </p>
    <div class="flex gap-1 overflow-x-auto border-b" role="tablist" aria-label="Profile analysis">
      <button
        v-for="(item, index) in tabs"
        :id="`profile-tab-${item.id}`"
        :key="item.id"
        type="button"
        role="tab"
        :aria-selected="tab === item.id"
        :tabindex="tab === item.id ? 0 : -1"
        :aria-controls="`profile-panel-${item.id}`"
        :data-testid="`${item.id}-tab`"
        class="monitoring-tab"
        @click="tab = item.id"
        @keydown="navigateTabs($event, index)"
      >
        {{ item.label }}
      </button>
    </div>
    <slot name="search" />
    <div
      v-if="tab !== 'profiles' && error"
      role="alert"
      class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
    >
      <p>{{ error }}</p>
      <Button variant="outline" @click="emit('retry')">Retry statistics</Button>
    </div>
    <div
      v-if="tab === 'transactions'"
      id="profile-panel-transactions"
      role="tabpanel"
      aria-labelledby="profile-tab-transactions"
      class="space-y-4"
      :aria-busy="loading"
    >
      <p class="text-xs text-muted-foreground">
        Grouped by profile name. Percentiles measure capture duration across matching profiles.
      </p>
      <div class="table-surface">
        <table class="app-table">
          <thead class="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th
                v-for="column in columns"
                :key="column.key"
                class="px-4 py-3"
                :aria-sort="
                  sort === column.key ? (descending ? 'descending' : 'ascending') : 'none'
                "
              >
                <button class="whitespace-nowrap font-medium" @click="order(column.key)">
                  {{ column.label
                  }}{{ column.key !== 'name' && column.key !== 'count' ? ' (ms)' : '' }}
                  <span v-if="sort === column.key">{{ descending ? '↓' : '↑' }}</span>
                </button>
              </th>
              <th class="px-4 py-3 font-medium">Project</th>
              <th class="px-4 py-3 font-medium">Sample</th>
            </tr>
          </thead>
          <tbody v-if="!loading && !error">
            <tr
              v-for="row in rows"
              :key="row.name"
              class="border-b last:border-0 hover:bg-muted/20"
            >
              <td class="max-w-96 px-4 py-2.5">
                <button
                  class="block max-w-full truncate text-left font-medium text-violet-600 hover:underline"
                  :title="row.name"
                  @click="inspect(row.name)"
                >
                  {{ row.name }}
                </button>
              </td>
              <td
                v-for="key in PROFILE_DURATION_AGGREGATIONS"
                :key="key"
                class="whitespace-nowrap px-4 py-2.5 font-mono text-xs"
              >
                {{ row[key].toFixed(2) }}
              </td>
              <td class="px-4 py-2.5 tabular-nums">{{ row.count }}</td>
              <td class="px-4 py-2.5 text-muted-foreground">{{ project }}</td>
              <td class="px-4 py-2.5">
                <RouterLink
                  class="whitespace-nowrap text-xs text-violet-600 hover:underline"
                  :to="{
                    name: 'project-profile-detail',
                    params: { groupSlug: group, projectSlug: project, profileId: row.profileId },
                  }"
                  >Open profile</RouterLink
                >
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="loading || error" class="grid min-h-52 place-items-center p-8 text-center text-sm">
          {{ loading ? 'Loading transactions…' : 'Transaction statistics unavailable' }}
        </p>
        <EmptyState
          v-else-if="!rows.length"
          class="min-h-52 p-8"
          title="No results found for your query"
        >
          <RouterLink
            class="text-xs text-violet-600 hover:underline"
            :to="{
              name: 'project-profiles-setup',
              params: { groupSlug: group, projectSlug: project },
            }"
            >View Profiles setup instructions</RouterLink
          >
        </EmptyState>
      </div>
      <TablePagination
        v-if="!error"
        :page="page"
        :total="transactions.length"
        :page-size="20"
        :busy="loading"
        unit="transactions"
        label="Transactions pagination"
        previous-label="Previous transactions"
        next-label="Next transactions"
        @change="page = $event"
      />
    </div>
    <div
      v-if="tab === 'aggregate'"
      id="profile-panel-aggregate"
      role="tabpanel"
      aria-labelledby="profile-tab-aggregate"
      class="rounded-lg border bg-background p-5"
      :aria-busy="loading"
    >
      <h2 class="text-sm font-medium">Aggregate Flamegraph</h2>
      <p class="my-3 text-xs text-muted-foreground">
        Call stacks merged by function and source location. Width represents estimated sampled time
        across all matching profiles; this is not a timeline.
      </p>
      <p v-if="loading || error" class="py-20 text-center text-sm text-muted-foreground">
        {{ loading ? 'Loading flamegraph…' : 'Flamegraph unavailable' }}
      </p>
      <EmptyState
        v-else-if="!overview?.flamegraph.length"
        class="py-20"
        title="No sampled stacks found"
      />
      <template v-else
        ><ProfileFlameChart :segments="overview.flamegraph" :duration-ms="overview.durationMs" />
        <p class="mt-4 text-xs text-muted-foreground">
          Total capture time: {{ overview.durationMs.toFixed(2) }} ms · Unsampled:
          {{ overview.unsampledMs.toFixed(2) }} ms
        </p></template
      >
    </div>
    <div
      v-show="tab === 'profiles'"
      id="profile-panel-profiles"
      role="tabpanel"
      aria-labelledby="profile-tab-profiles"
      class="space-y-4"
    >
      <slot />
    </div>
  </div>
</template>

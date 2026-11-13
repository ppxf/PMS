<script setup lang="ts">
import { formatDateTime } from '@/lib/date-time'
import { useProjectAccessStore } from "../model/project-access.store"
const projectAccess = useProjectAccessStore()
import EmptyState from '@/components/ui/empty-state/EmptyState.vue'
import TablePagination from '@/components/ui/pagination/TablePagination.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import FormSelect from '@/components/ui/select/FormSelect.vue'
import { AppError } from '@/services/http'
import { profilesOverview, queryProfiles } from '../api/profiles.api'
import ProfilesExplorer from '../components/ProfilesExplorer.vue'
import type { ProfileOverview } from '../model/profiles-overview'
import type { ProfileSummary } from '../model/profiles'
const route = useRoute()
const group = computed(() => String(route.params.groupSlug))
const project = computed(() => String(route.params.projectSlug))
const timeRange = ref('24h')
const environment = ref<'development' | 'production'>('development')
const environments = [
  { value: 'development' as const, label: 'development' },
  { value: 'production' as const, label: 'production' },
]
const search = ref('')
const ranges = [
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '31d', label: 'Last 31 days' },
]
const durations: Record<string, number> = {
  '1h': 3600000,
  '24h': 86400000,
  '7d': 7 * 86400000,
  '31d': 31 * 86400000,
}
const items = ref<ProfileSummary[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const error = ref('')
const overview = ref<ProfileOverview | null>(null)
const overviewLoading = ref(false)
const overviewError = ref('')
let overviewGeneration = 0
let generation = 0
let applied = {
  start: '',
  end: '',
  environment: undefined as string | undefined,
  search: undefined as string | undefined,
}
async function load() {
  const current = ++generation
  loading.value = true
  error.value = ''
  items.value = []
  total.value = 0
  try {
    const result = await queryProfiles(group.value, project.value, {
      ...applied,
      page: page.value,
      pageSize: 20,
    })
    if (generation !== current) return
    items.value = result.items
    total.value = result.total
  } catch {
    if (generation === current) error.value = 'Unable to load profiles. Please try again.'
  } finally {
    if (generation === current) loading.value = false
  }
}
async function loadOverview() {
  const current = ++overviewGeneration
  overviewLoading.value = true
  overview.value = null
  overviewError.value = ''
  try {
    const result = await profilesOverview(group.value, project.value, { ...applied })
    if (current === overviewGeneration) overview.value = result
  } catch (cause) {
    if (current === overviewGeneration) {
      overviewError.value =
        cause instanceof AppError && cause.status === 400
          ? cause.message
          : 'Unable to load profile statistics. Try a shorter time range or retry.'
    }
  } finally {
    if (current === overviewGeneration) overviewLoading.value = false
  }
}
function apply() {
  const now = Date.now()
  applied = {
    start: new Date(now - (durations[timeRange.value] ?? 86400000)).toISOString(),
    end: new Date(now).toISOString(),
    environment: environment.value,
    search: search.value.trim() || undefined,
  }
  page.value = 1
  void load()
  void loadOverview()
}
function inspectTransaction(name: string) {
  search.value = name
  apply()
}
function changePage(offset: number) {
  page.value += offset
  void load()
}
watch(
  () => [group.value, project.value],
  () => {
    environment.value = 'development'
    search.value = ''
    apply()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  generation++
  overviewGeneration++
})
</script>
<template>
  <section class="space-y-6">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="page-title">Profiles</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Find expensive browser functions from sampled call stacks.
        </p>
      </div>
    </header>
    <form
      id="profiles-filters"
      class="flex flex-wrap items-end gap-3 rounded-lg border bg-background p-4"
      @submit.prevent="apply"
    >
      <label class="flex w-44 flex-col gap-2 text-xs text-muted-foreground">
        <span>Time range</span>
        <FormSelect
          v-model="timeRange"
          aria-label="Time range"
          :options="ranges"
          @change="apply"
        />
      </label>
      <label class="flex w-40 flex-col gap-2 text-xs text-muted-foreground">
        <span>Environment</span>
        <FormSelect
          v-model="environment"
          aria-label="Environment"
          :options="environments"
          @change="apply"
        />
      </label>
    </form>
    <ProfilesExplorer
      :overview="overview"
      :loading="overviewLoading"
      :error="overviewError"
      :group="group"
      :project="project"
      @retry="loadOverview"
      @inspect="inspectTransaction"
    >
      <template #search
        ><div class="flex items-center gap-2">
          <Input
            v-model="search"
            form="profiles-filters"
            aria-label="Search profiles"
            placeholder="Search transactions and profile names…"
            class="bg-background"
          /><Button type="submit" form="profiles-filters" variant="outline">Search</Button>
        </div></template
      >
      <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
      <div class="table-surface" :aria-busy="loading">
        <table class="app-table">
          <thead class="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th class="p-3">Profile</th>
              <th class="p-3">Started</th>
              <th class="p-3">Duration</th>
              <th class="p-3">Samples</th>
              <th class="p-3">Environment</th>
              <th class="p-3">Release</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.profileId" class="border-b last:border-0">
              <td class="max-w-80 break-all p-3">
                <RouterLink v-if="projectAccess.canRoute('project-profiles-setup')"
                  class="font-medium hover:underline"
                  :to="{
                    name: 'project-profile-detail',
                    params: { groupSlug: group, projectSlug: project, profileId: item.profileId },
                  }"
                  >{{ item.name }}</RouterLink
                ><span v-if="item.truncated" class="ml-2 text-xs text-amber-700">Truncated</span>
              </td>
              <td class="whitespace-nowrap p-3">{{ formatDateTime(item.startedAt) }}</td>
              <td class="p-3">{{ item.durationMs.toFixed(2) }} ms</td>
              <td class="p-3">{{ item.sampleCount }}</td>
              <td class="p-3">{{ item.environment ?? '—' }}</td>
              <td class="max-w-48 break-all p-3">{{ item.release ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="loading" role="status" class="p-12 text-center text-sm text-muted-foreground">
          Loading profiles…
        </p>
        <EmptyState
          v-else-if="!error && !items.length"
          class="min-h-52 p-8"
          title="No profiles found."
          description="Adjust your filters or follow the setup instructions."
        >
          <RouterLink v-if="projectAccess.canRoute('project-profiles-setup')"
            class="text-xs text-violet-600 hover:underline"
            :to="{
              name: 'project-profiles-setup',
              params: { groupSlug: group, projectSlug: project },
            }"
            >Profiles setup instructions</RouterLink
          >
        </EmptyState>
      </div>
      <TablePagination
        :page="page"
        :total="total"
        :page-size="20"
        :busy="loading"
        unit="profiles"
        label="Profiles pagination"
        @change="changePage($event - page)"
      />
    </ProfilesExplorer>
  </section>
</template>

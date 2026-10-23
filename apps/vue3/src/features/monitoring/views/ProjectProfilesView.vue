<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import FormSelect from '@/components/ui/select/FormSelect.vue'
import ProfilesSetupGuide from '../components/ProfilesSetupGuide.vue'
import { profilesConfig, queryProfiles, updateProfiles } from '../api/profiles.api'
import type { ProfileSummary } from '../model/profiles'
const route = useRoute()
const group = computed(() => String(route.params.groupSlug))
const project = computed(() => String(route.params.projectSlug))
const timeRange = ref('24h')
const environment = ref('')
const search = ref('')
const traceId = ref('')
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
const configError = ref('')
const config = ref<{ enabled: boolean; dsn: string } | null>(null)
const saving = ref(false)
let generation = 0
let context = 0
let applied = {
  start: '',
  end: '',
  environment: undefined as string | undefined,
  search: undefined as string | undefined,
  traceId: undefined as string | undefined,
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
function apply() {
  const now = Date.now()
  applied = {
    start: new Date(now - (durations[timeRange.value] ?? 86400000)).toISOString(),
    end: new Date(now).toISOString(),
    environment: environment.value.trim() || undefined,
    search: search.value.trim() || undefined,
    traceId: traceId.value.trim() || undefined,
  }
  page.value = 1
  void load()
}
function changePage(offset: number) {
  page.value += offset
  void load()
}
async function loadConfig(current: number) {
  try {
    const value = await profilesConfig(group.value, project.value)
    if (current === context) config.value = value
  } catch {
    if (current === context) configError.value = 'Unable to load Profiles configuration.'
  }
}
async function toggle() {
  if (!config.value || saving.value) return
  const current = context
  const enabled = !config.value.enabled
  saving.value = true
  configError.value = ''
  try {
    const result = await updateProfiles(group.value, project.value, enabled)
    if (context === current && config.value) config.value.enabled = result.profilesEnabled
  } catch {
    if (current === context) configError.value = 'Unable to update Profiles configuration.'
  } finally {
    if (current === context) saving.value = false
  }
}
watch(
  () => [group.value, project.value, route.query.traceId],
  () => {
    const current = ++context
    config.value = null
    configError.value = ''
    saving.value = false
    environment.value = ''
    search.value = ''
    traceId.value = typeof route.query.traceId === 'string' ? route.query.traceId : ''
    apply()
    void loadConfig(current)
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  generation++
  context++
})
</script>
<template>
  <section class="space-y-6">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Profiles</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Find expensive browser functions from sampled call stacks.
        </p>
      </div>
      <div v-if="config" class="flex items-center gap-3">
        <span class="text-sm">Profiles {{ config.enabled ? 'enabled' : 'disabled' }}</span
        ><Button
          variant="outline"
          :aria-label="config.enabled ? 'Disable profiles' : 'Enable profiles'"
          :disabled="saving"
          @click="toggle"
          >{{ saving ? 'Saving…' : config.enabled ? 'Disable' : 'Enable' }}</Button
        >
      </div>
    </header>
    <p v-if="configError" role="alert" class="text-sm text-destructive">{{ configError }}</p>
    <ProfilesSetupGuide :dsn="config?.dsn ?? ''" />
    <form
      class="flex flex-wrap items-end gap-3 rounded-lg border bg-background p-4"
      @submit.prevent="apply"
    >
      <label class="w-44 space-y-1 text-xs text-muted-foreground"
        >Time range<FormSelect v-model="timeRange" aria-label="Time range" :options="ranges"
      /></label>
      <label class="w-40 space-y-1 text-xs text-muted-foreground"
        >Environment<Input
          v-model="environment"
          aria-label="Environment"
          placeholder="All environments"
      /></label>
      <label class="min-w-44 flex-1 space-y-1 text-xs text-muted-foreground"
        >Search<Input v-model="search" aria-label="Search profiles" placeholder="Profile name"
      /></label>
      <label class="w-44 space-y-1 text-xs text-muted-foreground"
        >Trace ID<Input v-model="traceId" aria-label="Trace ID" placeholder="Any trace"
      /></label>
      <Button type="submit">Apply filters</Button>
    </form>
    <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
    <div class="overflow-x-auto rounded-lg border bg-background" :aria-busy="loading">
      <table class="w-full text-left text-sm">
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
              <RouterLink
                class="font-medium hover:underline"
                :to="{
                  name: 'project-profile-detail',
                  params: { groupSlug: group, projectSlug: project, profileId: item.profileId },
                }"
                >{{ item.name }}</RouterLink
              ><span v-if="item.truncated" class="ml-2 text-xs text-amber-700">Truncated</span>
            </td>
            <td class="whitespace-nowrap p-3">{{ new Date(item.startedAt).toLocaleString() }}</td>
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
      <p v-else-if="!error && !items.length" class="p-12 text-center text-sm text-muted-foreground">
        No profiles found. Adjust your filters or follow the SDK setup instructions.
      </p>
    </div>
    <nav class="flex items-center justify-end gap-3 text-sm" aria-label="Profiles pagination">
      <span>{{ total }} profiles · Page {{ page }} of {{ Math.max(1, Math.ceil(total / 20)) }}</span
      ><Button
        aria-label="Previous page"
        variant="outline"
        :disabled="loading || page <= 1"
        @click="changePage(-1)"
        >Previous</Button
      ><Button
        aria-label="Next page"
        variant="outline"
        :disabled="loading || page * 20 >= total"
        @click="changePage(1)"
        >Next</Button
      >
    </nav>
  </section>
</template>

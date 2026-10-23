<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import FormSelect from '@/components/ui/select/FormSelect.vue'
import ProfileFlameChart from '../components/ProfileFlameChart.vue'
import { profileDetail } from '../api/profiles.api'
import { analyzeProfile, type Profile } from '../model/profiles'
const route = useRoute()
const group = computed(() => String(route.params.groupSlug))
const project = computed(() => String(route.params.projectSlug))
const profile = ref<Profile | null>(null)
const loading = ref(false)
const error = ref('')
const sort = ref('self')
const analysis = computed(() =>
  profile.value ? analyzeProfile(profile.value) : { functions: [], segments: [], unsampledMs: 0 },
)
const functions = computed(() =>
  [...analysis.value.functions].sort((a, b) =>
    sort.value === 'self' ? b.selfMs - a.selfMs : b.totalMs - a.totalMs,
  ),
)
let generation = 0
async function load() {
  const current = ++generation
  loading.value = true
  error.value = ''
  profile.value = null
  try {
    const result = await profileDetail(group.value, project.value, String(route.params.profileId))
    if (generation === current) profile.value = result
  } catch {
    if (generation === current)
      error.value = 'Unable to load profile. It may no longer exist or you may not have access.'
  } finally {
    if (generation === current) loading.value = false
  }
}
watch(
  () => [group.value, project.value, route.params.profileId],
  () => {
    void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  generation++
})
</script>
<template>
  <section class="space-y-6">
    <RouterLink
      class="text-sm text-muted-foreground hover:underline"
      :to="{ name: 'project-profiles', params: { groupSlug: group, projectSlug: project } }"
      >← All profiles</RouterLink
    >
    <p v-if="loading" role="status" class="text-sm text-muted-foreground">Loading profile…</p>
    <div v-else-if="error" class="space-y-3">
      <p role="alert" class="text-sm text-destructive">{{ error }}</p>
      <Button aria-label="Retry profile" variant="outline" @click="load">Retry</Button>
    </div>
    <template v-else-if="profile">
      <header class="space-y-3">
        <h1 class="break-all text-2xl font-semibold">{{ profile.name }}</h1>
        <div class="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span>{{ new Date(profile.startedAt).toLocaleString() }}</span
          ><span>{{ profile.durationMs.toFixed(2) }} ms duration</span
          ><span
            >{{ profile.samples.length }} samples · {{ profile.sampleIntervalMs }} ms interval</span
          ><span>{{ profile.environment ?? 'No environment' }}</span
          ><span v-if="profile.release">Release {{ profile.release }}</span>
        </div>
        <RouterLink
          v-if="profile.traceId"
          data-testid="profile-trace-link"
          class="inline-block break-all text-sm text-primary hover:underline"
          :to="{
            name: 'project-trace-detail',
            params: { groupSlug: group, projectSlug: project, traceId: profile.traceId },
            query: profile.spanId ? { spanId: profile.spanId } : {},
          }"
          >View Trace {{ profile.traceId }}</RouterLink
        >
      </header>
      <p v-if="profile.truncated" class="rounded-lg border bg-muted p-3 text-sm">
        This capture was truncated at the collection limit. It may not include the complete
        interaction.
      </p>
      <p class="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        Estimated sampled time is weighted by the interval until the next sample or capture end. It
        is not precise CPU time. Self excludes child calls; Total includes child calls and counts
        recursive functions once per sample. Unsampled: {{ analysis.unsampledMs.toFixed(2) }} ms.
        Function names are shown without Source Map processing.
      </p>
      <ProfileFlameChart :segments="analysis.segments" :duration-ms="profile.durationMs" />
      <section class="overflow-hidden rounded-lg border bg-background">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <h2 class="font-semibold">Functions</h2>
          <FormSelect
            v-model="sort"
            class="w-44"
            aria-label="Function ranking"
            :options="[
              { value: 'self', label: 'Self sampled time' },
              { value: 'total', label: 'Total sampled time' },
            ]"
          />
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th class="p-3">Function / resource</th>
                <th class="p-3">Self (ms, estimated)</th>
                <th class="p-3">Total (ms, estimated)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="fn in functions" :key="fn.frameId" class="border-t">
                <td class="max-w-xl break-all p-3">
                  <span class="font-mono text-xs">{{ fn.name }}</span>
                  <p v-if="fn.resource" class="mt-1 text-xs text-muted-foreground">
                    {{ fn.resource }}{{ fn.line == null ? '' : `:${fn.line}`
                    }}{{ fn.column == null ? '' : `:${fn.column}` }}
                  </p>
                </td>
                <td class="p-3 tabular-nums">{{ fn.selfMs.toFixed(2) }}</td>
                <td class="p-3 tabular-nums">{{ fn.totalMs.toFixed(2) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="!functions.length" class="p-6 text-center text-sm text-muted-foreground">
          {{ profile.samples.length ? 'No sampled function stacks' : 'No samples recorded' }}
        </p>
      </section>
    </template>
  </section>
</template>

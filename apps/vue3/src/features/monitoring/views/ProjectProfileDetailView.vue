<script setup lang="ts">
import { translate } from '@/i18n'

import { formatDateTime } from '@/lib/date-time'
import EmptyState from '@/components/ui/empty-state/EmptyState.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import FormSelect from '@/components/ui/select/FormSelect.vue'
import ProfileFlameChart from '../components/ProfileFlameChart.vue'
import { profileDetail } from '../api/profiles.api'
import { profileFunctionKind } from '../model/profile-function-scope'
import { analyzeProfile, type Profile } from '../model/profiles'
const route = useRoute()
const group = computed(() => String(route.params.groupSlug))
const project = computed(() => String(route.params.projectSlug))
const profile = ref<Profile | null>(null)
const loading = ref(false)
const error = ref('')
const sort = ref('self')
const scope = ref('application')
const analysis = computed(() =>
  profile.value ? analyzeProfile(profile.value) : { functions: [], segments: [], unsampledMs: 0 },
)
const functions = computed(() =>
  analysis.value.functions
    .filter(
      (fn) =>
        scope.value === 'all' ||
        (scope.value === 'application'
          ? ['application', 'unknown'].includes(profileFunctionKind(fn.resource))
          : profileFunctionKind(fn.resource) === scope.value),
    )
    .sort((a, b) => (sort.value === 'self' ? b.selfMs - a.selfMs : b.totalMs - a.totalMs)),
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
      >{{ translate('← All profiles') }}</RouterLink
    >
    <p v-if="loading" role="status" class="text-sm text-muted-foreground">
      {{ translate('Loading profile…') }}
    </p>
    <div v-else-if="error" class="space-y-3">
      <p role="alert" class="text-sm text-destructive">{{ translate(error) }}</p>
      <Button :aria-label="translate('Retry profile')" variant="outline" @click="load">{{
        translate('Retry')
      }}</Button>
    </div>
    <template v-else-if="profile">
      <header class="space-y-3">
        <h1 class="page-title break-all">{{ profile.name }}</h1>
        <div class="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span>{{ formatDateTime(profile.startedAt) }}</span
          ><span>{{ profile.durationMs.toFixed(2) }} {{ translate('ms duration') }}</span
          ><span
            >{{ profile.samples.length }} {{ translate('samples ·') }}
            {{ profile.sampleIntervalMs }} {{ translate('ms interval') }}</span
          ><span>{{ translate(profile.environment ?? 'No environment') }}</span
          ><span v-if="profile.release">{{ translate('Release') }} {{ profile.release }}</span>
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
          >{{ translate('View Trace') }} {{ profile.traceId }}</RouterLink
        >
      </header>
      <p v-if="profile.truncated" class="rounded-lg border bg-muted p-3 text-sm">
        {{
          translate(
            'This capture was truncated at the collection limit. It may not include the complete interaction.',
          )
        }}
      </p>
      <p class="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        {{
          translate(
            'Estimated sampled time is weighted by the interval until the next sample or capture end. It is not precise CPU time. Self excludes child calls; Total includes child calls and counts recursive functions once per sample. Unsampled:',
          )
        }}
        {{ analysis.unsampledMs.toFixed(2) }}
        {{ translate('ms. Function names are shown without Source Map processing.') }}
      </p>
      <ProfileFlameChart :segments="analysis.segments" :duration-ms="profile.durationMs" />
      <section class="overflow-hidden rounded-lg border bg-background">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <h2 class="font-semibold">{{ translate('Functions') }}</h2>
          <FormSelect
            v-model="scope"
            :aria-label="translate('Function scope')"
            class="w-48"
            :options="[
              { value: 'application', label: 'Application functions' },
              { value: 'sdk', label: 'SDK functions' },
              { value: 'dependency', label: 'Framework and dependencies' },
              { value: 'all', label: 'All functions' },
            ]"
          />
          <FormSelect
            v-model="sort"
            class="w-44"
            :aria-label="translate('Function ranking')"
            :options="[
              { value: 'self', label: 'Self sampled time' },
              { value: 'total', label: 'Total sampled time' },
            ]"
          />
        </div>
        <p class="p-4 text-sm text-muted-foreground">
          {{
            translate(
              'Unknown-source frames remain visible. View All functions to inspect SDK and framework overhead.',
            )
          }}
        </p>
        <p class="px-4 pb-4 text-sm text-muted-foreground">
          {{
            translate(
              'Self excludes child calls. Total includes child calls; do not add totals across functions.',
            )
          }}
        </p>
        <div class="table-surface">
          <table class="app-table">
            <thead class="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th class="p-3">{{ translate('Function / resource') }}</th>
                <th class="p-3">{{ translate('Self (ms, estimated)') }}</th>
                <th class="p-3">{{ translate('Total (ms, estimated)') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="fn in functions" :key="fn.frameId" class="border-t">
                <td class="max-w-xl break-all p-3">
                  <span class="font-mono text-xs">{{ fn.name }}</span>
                  <span class="ml-2 text-xs text-muted-foreground">{{
                    translate(
                      {
                        application: 'Application',
                        sdk: 'SDK',
                        dependency: 'Framework and dependencies',
                        unknown: 'Unknown source',
                      }[profileFunctionKind(fn.resource)],
                    )
                  }}</span>
                  <p v-if="fn.resource" class="mt-1 text-xs text-muted-foreground">
                    {{ fn.resource }}{{ translate(fn.line == null ? '' : `:${fn.line}`)
                    }}{{ translate(fn.column == null ? '' : `:${fn.column}`) }}
                  </p>
                </td>
                <td class="p-3 tabular-nums">{{ fn.selfMs.toFixed(2) }}</td>
                <td class="p-3 tabular-nums">{{ fn.totalMs.toFixed(2) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <EmptyState
          v-if="!functions.length"
          class="p-6"
          :title="
            translate(profile.samples.length ? 'No sampled function stacks' : 'No samples recorded')
          "
        />
      </section>
    </template>
  </section>
</template>

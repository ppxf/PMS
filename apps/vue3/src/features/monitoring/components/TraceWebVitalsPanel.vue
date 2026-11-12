<script setup lang="ts">
import EmptyState from '@/components/ui/empty-state/EmptyState.vue'
import TablePagination from '@/components/ui/pagination/TablePagination.vue'
import { onBeforeUnmount, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { webVitalsQuery } from '../api/web-vitals.api'
import { formatVital, type VitalSample } from '../model/web-vitals'
const props = defineProps<{ group: string; project: string; traceId: string }>()
const items = ref<VitalSample[]>([])
const loading = ref(false),
  error = ref(''),
  page = ref(1),
  total = ref(0)
let generation = 0
async function load() {
  const current = ++generation
  loading.value = true
  error.value = ''
  items.value = []
  try {
    const result = await webVitalsQuery<{ items: VitalSample[]; total: number }>(
      props.group,
      props.project,
      'samples',
      { traceId: props.traceId, page: page.value, pageSize: 10 },
    )
    if (current === generation) {
      items.value = result.items
      total.value = result.total
    }
  } catch {
    if (current === generation) error.value = 'Unable to load Web Vitals.'
  } finally {
    if (current === generation) loading.value = false
  }
}
watch(
  () => [props.group, props.project, props.traceId],
  () => {
    page.value = 1
    void load()
  },
  { immediate: true },
)
function paginate(delta: number) {
  page.value += delta
  void load()
}
onBeforeUnmount(() => {
  generation++
})
</script>
<template>
  <section class="rounded-xl border bg-background p-5 space-y-3" aria-label="Trace Web Vitals">
    <div class="flex items-center justify-between gap-3">
      <h2 class="font-semibold">Web Vitals</h2>
      <RouterLink
        :to="{
          name: 'project-web-vitals',
          params: { groupSlug: group, projectSlug: project },
          query: { traceId },
        }"
        class="text-sm underline"
        >Explore page experiences</RouterLink
      >
    </div>
    <p class="text-sm text-muted-foreground">
      Document experience measurements can update after this trace ends.
    </p>
    <p v-if="loading" role="status">Loading Web Vitals…</p>
    <p v-else-if="error" role="alert">
      {{ error }} <Button variant="outline" @click="load">Retry</Button>
    </p>
    <EmptyState
      v-else-if="!items.length"
      class="py-8"
      title="No page experience is retained for this trace in the last 30 days."
    />
    <article v-for="sample in items" :key="sample.pageViewId" class="border-t pt-3 space-y-2">
      <p class="text-sm font-medium">
        {{ sample.route }} · {{ new Date(sample.startedAt).toLocaleString() }}
      </p>
      <div class="flex flex-wrap gap-4 text-sm">
        <div v-for="measurement in sample.measurements" :key="measurement.name">
          <p>
            {{ measurement.name }}:
            <strong>{{ formatVital(measurement.name, measurement.value) }}</strong>
          </p>
          <details
            v-if="measurement.attribution && Object.keys(measurement.attribution).length"
            class="max-w-lg"
          >
            <summary class="cursor-pointer text-muted-foreground">Attribution</summary>
            <pre class="whitespace-pre-wrap break-all text-xs">{{
              JSON.stringify(measurement.attribution, null, 2)
            }}</pre>
          </details>
        </div>
      </div>
    </article>
    <TablePagination
      v-if="total > 10"
      :page="page"
      :total="total"
      :page-size="10"
      :busy="loading"
      unit="samples"
      label="Trace Web Vitals pagination"
      @change="paginate($event - page)"
    />
  </section>
</template>

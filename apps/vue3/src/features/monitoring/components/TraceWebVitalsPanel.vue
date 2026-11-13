<script setup lang="ts">
import { formatDateTime } from '@/lib/date-time'
import EmptyState from '@/components/ui/empty-state/EmptyState.vue'
import TablePagination from '@/components/ui/pagination/TablePagination.vue'
import { onBeforeUnmount, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { webVitalsQuery } from '../api/web-vitals.api'
import { formatVital, type VitalSample } from '../model/web-vitals'
const props = defineProps<{ group: string; project: string; traceId: string }>()
const emit = defineEmits<{ loaded: [samples: VitalSample[]] }>()
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
      emit('loaded', result.items)
    }
  } catch {
    if (current === generation) {
      error.value = 'Unable to load Web Vitals.'
      emit('loaded', [])
    }
  } finally {
    if (current === generation) loading.value = false
  }
}
watch(
  () => [props.group, props.project, props.traceId],
  () => {
    page.value = 1
    emit('loaded', [])
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
      <Button variant="outline" size="sm" :disabled="loading" @click="load"
        >Refresh Web Vitals</Button
      >
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
        {{ sample.route }} · {{ formatDateTime(sample.startedAt) }}
      </p>
      <div class="grid min-w-0 grid-cols-1 items-stretch gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="measurement in sample.measurements"
          :key="measurement.name"
          class="min-w-0 rounded-lg border bg-muted/20 p-3"
        >
          <p class="flex items-center justify-between gap-3">
            <span class="text-xs font-medium text-muted-foreground">{{ measurement.name }}</span>
            <strong class="tabular-nums">{{
              formatVital(measurement.name, measurement.value)
            }}</strong>
          </p>
          <details
            v-if="measurement.attribution && Object.keys(measurement.attribution).length"
            class="mt-3 min-w-0 border-t pt-2"
          >
            <summary
              class="cursor-pointer rounded text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              Attribution
            </summary>
            <div class="mt-2 min-w-0">
              <pre class="code-block" tabindex="0">{{
                JSON.stringify(measurement.attribution, null, 2)
              }}</pre>
            </div>
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

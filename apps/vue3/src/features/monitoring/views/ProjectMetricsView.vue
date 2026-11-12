<script setup lang="ts">
import { useProjectAccessStore } from "../model/project-access.store"
const projectAccess = useProjectAccessStore()
import { ref, watch, onBeforeUnmount } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { RefreshCw, Plus } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import FormSelect from '@/components/ui/select/FormSelect.vue'
import MetricPanel from '../components/MetricPanel.vue'
import { metricCatalog } from '../api/metrics.api'
import type { MetricCatalog } from '../model/metrics'
const route = useRoute()
const catalog = ref<MetricCatalog | null>(null),
  error = ref(''),
  loading = ref(false),
  range = ref(24)
let nextId = 1,
  generation = 0
const cards = ref([{ id: 0, initialIndex: 0 }])
function makeWindow() {
  const now = Date.now()
  return {
    start: new Date(now - range.value * 3600000).toISOString(),
    end: new Date(now).toISOString(),
  }
}
const window = ref(makeWindow())
function changeRange() {
  window.value = makeWindow()
}
function addMetric() {
  if (cards.value.length < 5) {
    const id = nextId++
    cards.value.push({ id, initialIndex: cards.value.length })
  }
}
function removeMetric(id: number) {
  if (cards.value.length > 1) cards.value = cards.value.filter((card) => card.id !== id)
}
async function refresh() {
  const current = ++generation
  loading.value = true
  error.value = ''
  try {
    const result = await metricCatalog(
      String(route.params.groupSlug),
      String(route.params.projectSlug),
    )
    if (current === generation) {
      catalog.value = result
      window.value = makeWindow()
    }
  } catch (e) {
    if (current === generation)
      error.value = e instanceof Error ? e.message : 'Unable to load metric catalog'
  } finally {
    if (current === generation) loading.value = false
  }
}
watch(
  () => [route.params.groupSlug, route.params.projectSlug],
  () => {
    catalog.value = null
    cards.value = [{ id: nextId++, initialIndex: 0 }]
    void refresh()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  generation++
})
</script>
<template>
  <section class="space-y-4">
    <header class="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
      <h2 class="page-title">Metrics</h2>
      <div class="flex flex-wrap items-center gap-2">
        <FormSelect
          v-model="range"
          aria-label="Time range"
          class="w-36"
          :options="[
            { value: 1, label: 'Last hour' },
            { value: 6, label: 'Last 6 hours' },
            { value: 24, label: 'Last 24 hours' },
            { value: 72, label: 'Last 3 days' },
            { value: 168, label: 'Last 7 days' },
          ]"
          @change="changeRange"
        />
        <Button
          variant="outline"
          size="icon"
          aria-label="Refresh"
          title="Refresh"
          :disabled="loading"
          @click="refresh"
          ><RefreshCw class="size-4"
        /></Button>
        <Button aria-label="Add metric" :disabled="!catalog || cards.length >= 5" @click="addMetric"
          ><Plus class="size-4" />Add metric</Button
        >
      </div>
    </header>
    <p v-if="catalog && !catalog.enabled" class="text-sm text-amber-700">
      Custom metric ingestion is disabled for this project. Automatic Web Vitals remain available.
      <RouterLink v-if="projectAccess.canRoute('project-detail')" :to="{ name: 'project-detail', params: route.params }" class="underline"
        >Project settings</RouterLink
      >
    </p>
    <p v-if="loading && !catalog" role="status">Loading metric catalog…</p>
    <p v-if="error" role="alert" class="text-sm text-destructive">
      {{ error }} <Button variant="outline" @click="refresh">Retry</Button>
    </p>
    <template v-if="catalog">
      <MetricPanel
        v-for="(card, index) in cards"
        :key="card.id"
        data-metric-panel
        :catalog="catalog"
        :range="range"
        :window="window"
        :initial-index="card.initialIndex"
        :label="String.fromCharCode(65 + index)"
        :removable="cards.length > 1"
        @remove="removeMetric(card.id)"
      />
      <p class="text-xs text-muted-foreground">
        {{ cards.length }} / 5 metrics · Each card has independent filters, units and pagination.
      </p>
    </template>
  </section>
</template>

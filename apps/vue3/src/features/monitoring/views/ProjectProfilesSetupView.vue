<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import ProfilesSetupGuide from '../components/ProfilesSetupGuide.vue'
import { getProject } from '../api/monitoring.api'
import type { MonitoringProject } from '../model/types'

const route = useRoute()
const group = computed(() => String(route.params.groupSlug))
const slug = computed(() => String(route.params.projectSlug))
const project = ref<MonitoringProject | null>(null)
const loading = ref(true)
const error = ref('')
let generation = 0

watch(
  [group, slug],
  async () => {
    const current = ++generation
    project.value = null
    loading.value = true
    error.value = ''
    try {
      const result = await getProject(group.value, slug.value)
      if (current === generation) project.value = result
    } catch {
      if (current === generation) error.value = 'Unable to load SDK setup information'
    } finally {
      if (current === generation) loading.value = false
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  generation++
})
</script>

<template>
  <section class="space-y-6">
    <p v-if="loading" class="text-muted-foreground">Loading…</p>
    <p v-else-if="error" role="alert" class="text-destructive">{{ error }}</p>
    <template v-else-if="project">
      <header>
        <h1 class="page-title">Profiles setup</h1>
        <p class="mt-1 text-muted-foreground">
          {{ project.name }} · Set up browser profiling from sampled call stacks.
        </p>
      </header>
      <ProfilesSetupGuide :dsn="project.dsn" />
    </template>
  </section>
</template>

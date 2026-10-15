<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { listGroups } from '../api/monitoring.api'
import type { MonitoringGroup } from '../model/types'

const groups = ref<MonitoringGroup[]>([])
const loading = ref(true)
const error = ref('')

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    groups.value = await listGroups()
  } catch {
    error.value = 'Unable to load groups'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="space-y-6">
    <div class="flex items-center justify-between gap-4">
      <div>
        <h2 class="text-2xl font-semibold tracking-tight">Groups</h2>
        <p class="mt-1 text-muted-foreground">Organize your monitoring projects.</p>
      </div>
      <Button as-child
        ><RouterLink :to="{ name: 'create-group-onboarding' }">Create group</RouterLink></Button
      >
    </div>

    <p v-if="loading" class="text-muted-foreground">Loading…</p>
    <div v-else-if="error" class="space-y-3" role="alert">
      <p class="text-destructive">{{ error }}</p>
      <Button variant="outline" @click="load">Retry</Button>
    </div>
    <Card v-else-if="groups.length === 0">
      <CardHeader>
        <CardTitle>No groups yet</CardTitle>
        <CardDescription>Create a group to add monitoring projects.</CardDescription>
      </CardHeader>
    </Card>
    <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <RouterLink
        v-for="group in groups"
        :key="group.id"
        :to="{ name: 'group-detail', params: { groupSlug: group.slug } }"
      >
        <Card class="h-full transition-colors hover:bg-muted/30">
          <CardHeader>
            <CardTitle>{{ group.name }}</CardTitle>
            <CardDescription
              >{{ group.projectCount }}
              {{ group.projectCount === 1 ? 'project' : 'projects' }}</CardDescription
            >
          </CardHeader>
          <CardContent class="text-xs text-muted-foreground">/{{ group.slug }}</CardContent>
        </Card>
      </RouterLink>
    </div>
  </section>
</template>

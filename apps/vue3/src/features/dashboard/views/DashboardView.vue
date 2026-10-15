<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { FolderKanban, Layers3 } from '@lucide/vue'
import { Button } from '@/components/ui/button'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { listGroups, listProjects } from '@/features/monitoring/api/monitoring.api'
import type { MonitoringGroup, MonitoringProject } from '@/features/monitoring/model/types'

type RecentProject = MonitoringProject & { groupName: string; groupSlug: string }

const groups = ref<MonitoringGroup[]>([])
const projects = ref<RecentProject[]>([])
const loading = ref(true)
const loadFailed = ref(false)

const recentProjects = computed(() =>
  [...projects.value]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 5),
)

onMounted(async () => {
  try {
    groups.value = await listGroups()
    const projectLists = await Promise.all(
      groups.value.map(async (group) =>
        (await listProjects(group.slug)).map((project) => ({
          ...project,
          groupName: group.name,
          groupSlug: group.slug,
        })),
      ),
    )
    projects.value = projectLists.flat()
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 class="text-2xl font-semibold tracking-tight">Monitoring dashboard</h2>
        <p class="mt-1 text-muted-foreground">
          View your groups, projects, and recently created monitoring projects.
        </p>
      </div>
      <Button as-child
        ><RouterLink :to="{ name: 'groups' }"> Manage groups and projects </RouterLink></Button
      >
    </div>

    <p
      v-if="loadFailed"
      class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
    >
      Failed to load dashboard data. Please try again later.
    </p>

    <div class="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader class="flex-row items-center justify-between gap-4">
          <div>
            <CardDescription>Groups</CardDescription>
            <CardTitle class="mt-2 text-2xl">{{
              loading ? '—' : `${groups.length} ${groups.length === 1 ? 'group' : 'groups'}`
            }}</CardTitle>
          </div>
          <Layers3 class="size-6 text-muted-foreground" />
        </CardHeader>
      </Card>
      <Card>
        <CardHeader class="flex-row items-center justify-between gap-4">
          <div>
            <CardDescription>Monitoring projects</CardDescription>
            <CardTitle class="mt-2 text-2xl">{{
              loading ? '—' : `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`
            }}</CardTitle>
          </div>
          <FolderKanban class="size-6 text-muted-foreground" />
        </CardHeader>
      </Card>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Recently created projects</CardTitle>
        <CardDescription>The five most recently created monitoring projects.</CardDescription>
      </CardHeader>
      <CardContent>
        <p v-if="loading" class="text-sm text-muted-foreground">Loading...</p>
        <p v-else-if="recentProjects.length === 0" class="text-sm text-muted-foreground">
          No projects yet.
        </p>
        <div v-else class="divide-y rounded-md border">
          <RouterLink
            v-for="project in recentProjects"
            :key="project.id"
            :to="{
              name: 'project-detail',
              params: { groupSlug: project.groupSlug, projectSlug: project.slug },
            }"
            class="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
          >
            <div>
              <p class="font-medium">{{ project.name }}</p>
              <p class="text-sm text-muted-foreground">{{ project.groupName }}</p>
            </div>
            <span class="text-xs uppercase text-muted-foreground">{{ project.platform }}</span>
          </RouterLink>
        </div>
      </CardContent>
    </Card>
  </section>
</template>

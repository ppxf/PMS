<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { FolderKanban, Layers3 } from '@lucide/vue'

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
        <h2 class="text-2xl font-semibold tracking-tight">监控工作台</h2>
        <p class="mt-1 text-muted-foreground">查看你的组、项目以及最近创建的监控项目。</p>
      </div>
      <RouterLink
        :to="{ name: 'groups' }"
        class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        管理组与项目
      </RouterLink>
    </div>

    <p v-if="loadFailed" class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      工作台数据加载失败，请稍后重试。
    </p>

    <div class="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader class="flex-row items-center justify-between gap-4">
          <div>
            <CardDescription>组</CardDescription>
            <CardTitle class="mt-2 text-2xl">{{ loading ? '—' : `${groups.length} 个组` }}</CardTitle>
          </div>
          <Layers3 class="size-6 text-muted-foreground" />
        </CardHeader>
      </Card>
      <Card>
        <CardHeader class="flex-row items-center justify-between gap-4">
          <div>
            <CardDescription>监控项目</CardDescription>
            <CardTitle class="mt-2 text-2xl">{{ loading ? '—' : `${projects.length} 个项目` }}</CardTitle>
          </div>
          <FolderKanban class="size-6 text-muted-foreground" />
        </CardHeader>
      </Card>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>最近创建的项目</CardTitle>
        <CardDescription>按创建时间展示最近的 5 个监控项目。</CardDescription>
      </CardHeader>
      <CardContent>
        <p v-if="loading" class="text-sm text-muted-foreground">正在加载...</p>
        <p v-else-if="recentProjects.length === 0" class="text-sm text-muted-foreground">暂时还没有项目。</p>
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

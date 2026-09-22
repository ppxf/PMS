<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getGroup, listProjects } from '../api/monitoring.api'
import type { MonitoringGroup, MonitoringProject } from '../model/types'

const route = useRoute()
const groupSlug = String(route.params.groupSlug)
const group = ref<MonitoringGroup | null>(null)
const projects = ref<MonitoringProject[]>([])
const loading = ref(true)
const error = ref('')

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    ;[group.value, projects.value] = await Promise.all([
      getGroup(groupSlug),
      listProjects(groupSlug),
    ])
  } catch {
    error.value = '无法加载组详情'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="space-y-6">
    <p v-if="loading" class="text-muted-foreground">正在加载…</p>
    <div v-else-if="error" class="space-y-3" role="alert">
      <p class="text-destructive">{{ error }}</p>
      <Button variant="outline" @click="load">重试</Button>
    </div>
    <template v-else-if="group">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h2 class="text-2xl font-semibold tracking-tight">{{ group.name }}</h2>
          <p class="mt-1 text-muted-foreground">管理该组下的 Vue 监控项目。</p>
        </div>
        <Button as-child>
          <RouterLink :to="{ name: 'create-project', params: { groupSlug } }">创建项目</RouterLink>
        </Button>
      </div>

      <Card v-if="projects.length === 0">
        <CardHeader>
          <CardTitle>还没有监控项目</CardTitle>
          <CardDescription>创建 Vue 项目并获取 DSN 接入指引。</CardDescription>
        </CardHeader>
      </Card>
      <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <RouterLink
          v-for="project in projects"
          :key="project.id"
          :to="{ name: 'project-detail', params: { groupSlug, projectSlug: project.slug } }"
        >
          <Card class="h-full transition-colors hover:bg-muted/30">
            <CardHeader>
              <CardTitle>{{ project.name }}</CardTitle>
              <CardDescription
                >{{ project.connected ? '已连接' : '等待连接' }} · Vue</CardDescription
              >
            </CardHeader>
          </Card>
        </RouterLink>
      </div>
    </template>
  </section>
</template>

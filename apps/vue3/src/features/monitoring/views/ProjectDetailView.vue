<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getProject } from '../api/monitoring.api'
import type { MonitoringProject } from '../model/types'

const route = useRoute()
const groupSlug = String(route.params.groupSlug)
const projectSlug = String(route.params.projectSlug)
const project = ref<MonitoringProject | null>(null)
const error = ref('')

const featureLabels = [
  ['errorMonitoringEnabled', 'Error Monitoring'],
  ['loggingEnabled', 'Logging'],
  ['tracingEnabled', 'Tracing'],
  ['metricsEnabled', 'Application Metrics'],
] as const

onMounted(async () => {
  try {
    project.value = await getProject(groupSlug, projectSlug)
  } catch {
    error.value = '无法加载项目详情'
  }
})
</script>

<template>
  <section class="space-y-6">
    <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
    <template v-else-if="project">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 class="text-2xl font-semibold tracking-tight">{{ project.name }}</h2>
          <p class="mt-1 text-muted-foreground">Vue 监控项目</p>
        </div>
        <Badge :variant="project.connected ? 'default' : 'secondary'">
          {{ project.connected ? '已连接' : '等待连接' }}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle class="text-base">功能配置</CardTitle>
          <CardDescription>当前仅保存开关，监控采集将在后续实现。</CardDescription>
        </CardHeader>
        <CardContent class="grid gap-3 sm:grid-cols-2">
          <div
            v-for="[key, label] in featureLabels"
            :key="key"
            class="flex items-center justify-between rounded-lg border p-3"
          >
            <span>{{ label }}</span>
            <Badge :variant="project[key] ? 'default' : 'secondary'">{{
              project[key] ? '已开启' : '未开启'
            }}</Badge>
          </div>
        </CardContent>
      </Card>

      <Button as-child
        ><RouterLink :to="{ name: 'project-setup', params: { groupSlug, projectSlug } }"
          >查看 SDK 接入指引</RouterLink
        ></Button
      >
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { buildCheckSnippet, buildEnvSnippet } from '../utils/sdk-setup'
import { getProject, getProjectConnection } from '../api/monitoring.api'
import type { MonitoringProject } from '../model/types'

const route = useRoute()
const groupSlug = String(route.params.groupSlug)
const projectSlug = String(route.params.projectSlug)
const project = ref<MonitoringProject | null>(null)
const loading = ref(true)
const error = ref('')
const copied = ref('')

const envSnippet = computed(() => (project.value ? buildEnvSnippet(project.value.dsn) : ''))
const checkSnippet = computed(() => (project.value ? buildCheckSnippet(project.value.dsn) : ''))

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    project.value = await getProject(groupSlug, projectSlug)
  } catch {
    error.value = '无法加载 SDK 接入信息'
  } finally {
    loading.value = false
  }
}

async function copy(value: string, label: string): Promise<void> {
  await navigator.clipboard.writeText(value)
  copied.value = label
}

async function refreshConnection(): Promise<void> {
  if (!project.value) return
  const connection = await getProjectConnection(groupSlug, projectSlug)
  project.value.connected = connection.connected
  project.value.lastSeenAt = connection.lastSeenAt
}

onMounted(load)
</script>

<template>
  <section class="space-y-6">
    <p v-if="loading" class="text-muted-foreground">正在加载…</p>
    <p v-else-if="error" role="alert" class="text-destructive">{{ error }}</p>
    <template v-else-if="project">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 class="text-2xl font-semibold tracking-tight">配置 Vue SDK</h2>
          <p class="mt-1 text-muted-foreground">{{ project.name }} · 本阶段仅校验 DSN 连接。</p>
        </div>
        <Badge :variant="project.connected ? 'default' : 'secondary'">
          {{ project.connected ? '已连接' : '等待连接' }}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle class="text-base">DSN</CardTitle>
          <CardDescription>该公开地址只用于识别项目和连接校验。</CardDescription>
        </CardHeader>
        <CardContent class="space-y-3">
          <pre class="overflow-x-auto rounded-lg bg-muted p-4 text-xs">{{ project.dsn }}</pre>
          <Button data-testid="copy-dsn" variant="outline" @click="copy(project.dsn, 'DSN')"
            >复制 DSN</Button
          >
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle class="text-base">环境变量</CardTitle></CardHeader>
        <CardContent class="space-y-3">
          <pre class="overflow-x-auto rounded-lg bg-muted p-4 text-xs">{{ envSnippet }}</pre>
          <Button variant="outline" @click="copy(envSnippet, '环境变量')">复制环境变量</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-base">发送连接校验</CardTitle>
          <CardDescription>将代码放入本地 Vue 项目执行，不会上报监控事件。</CardDescription>
        </CardHeader>
        <CardContent class="space-y-3">
          <pre
            class="overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-4 text-xs text-slate-100"
            >{{ checkSnippet }}</pre>
          <div class="flex flex-wrap gap-2">
            <Button variant="outline" @click="copy(checkSnippet, '校验代码')">复制校验代码</Button>
            <Button data-testid="refresh-connection" @click="refreshConnection"
              >刷新连接状态</Button
            >
          </div>
          <p v-if="copied" role="status" class="text-sm text-muted-foreground">
            已复制{{ copied }}
          </p>
          <p v-if="project.lastSeenAt" class="text-sm text-muted-foreground">
            最近连接：{{
              new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(
                new Date(project.lastSeenAt),
              )
            }}
          </p>
        </CardContent>
      </Card>

      <div class="flex gap-3">
        <Button as-child variant="outline"
          ><RouterLink :to="{ name: 'group-detail', params: { groupSlug } }"
            >返回组详情</RouterLink
          ></Button
        >
        <Button as-child
          ><RouterLink :to="{ name: 'project-detail', params: { groupSlug, projectSlug } }"
            >进入项目详情</RouterLink
          ></Button
        >
      </div>
    </template>
  </section>
</template>

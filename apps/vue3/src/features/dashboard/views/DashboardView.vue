<script setup lang="ts">
import { Activity, Database, ShieldCheck, Workflow } from '@lucide/vue'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const capabilities = [
  {
    title: '请求层',
    description: 'Axios 拦截、统一解包与 AppError',
    icon: Database,
  },
  {
    title: '服务端状态',
    description: 'TanStack Vue Query 缓存与重试策略',
    icon: Activity,
  },
  {
    title: '权限控制',
    description: '路由 Meta、守卫和 v-permission',
    icon: ShieldCheck,
  },
  {
    title: '业务边界',
    description: '按 Feature 组织 API、模型和页面',
    icon: Workflow,
  },
]
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-2xl font-semibold tracking-tight">框架工作台</h2>
      <p class="mt-1 text-muted-foreground">
        基础设施已经接通，可直接从 features 目录开始开发业务。
      </p>
    </div>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card v-for="item in capabilities" :key="item.title">
        <CardHeader class="flex-row items-center justify-between gap-4">
          <div>
            <CardTitle class="text-base">{{ item.title }}</CardTitle>
            <CardDescription class="mt-1">{{ item.description }}</CardDescription>
          </div>
          <component :is="item.icon" class="size-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div class="h-1.5 overflow-hidden rounded-full bg-muted">
            <div class="h-full w-full rounded-full bg-primary" />
          </div>
        </CardContent>
      </Card>
    </div>
  </section>
</template>

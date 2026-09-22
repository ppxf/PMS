<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { AppError } from '@/services/http'
import { createProject } from '../api/monitoring.api'

const route = useRoute()
const router = useRouter()
const groupSlug = String(route.params.groupSlug)
const name = ref('')
const errorMonitoringEnabled = ref(true)
const loggingEnabled = ref(false)
const tracingEnabled = ref(false)
const metricsEnabled = ref(false)
const submitting = ref(false)
const error = ref('')

const features = [
  { key: 'error', title: 'Error Monitoring', description: '捕获前端异常与堆栈信息' },
  { key: 'logging', title: 'Logging', description: '关联应用日志与问题上下文' },
  { key: 'tracing', title: 'Tracing', description: '跟踪应用请求和性能链路' },
  { key: 'metrics', title: 'Application Metrics', description: '记录应用性能与业务指标' },
] as const

function featureModel(key: (typeof features)[number]['key']) {
  return {
    error: errorMonitoringEnabled,
    logging: loggingEnabled,
    tracing: tracingEnabled,
    metrics: metricsEnabled,
  }[key]
}

async function submit(): Promise<void> {
  error.value = ''
  submitting.value = true
  try {
    const project = await createProject(groupSlug, {
      name: name.value,
      platform: 'vue',
      errorMonitoringEnabled: errorMonitoringEnabled.value,
      loggingEnabled: loggingEnabled.value,
      tracingEnabled: tracingEnabled.value,
      metricsEnabled: metricsEnabled.value,
    })
    await router.push({
      name: 'project-setup',
      params: { groupSlug, projectSlug: project.slug },
    })
  } catch (cause) {
    error.value = cause instanceof AppError ? cause.message : '创建项目失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="mx-auto max-w-3xl space-y-6">
    <div>
      <h2 class="text-2xl font-semibold tracking-tight">创建监控项目</h2>
      <p class="mt-1 text-muted-foreground">选择需要启用的能力，当前阶段仅保存配置。</p>
    </div>

    <form class="space-y-6" @submit.prevent="submit">
      <Card>
        <CardHeader>
          <CardTitle class="text-base">框架</CardTitle>
          <CardDescription>当前仅支持 Vue。</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="rounded-lg border bg-muted/30 px-4 py-3 font-medium">Vue</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-base">监控能力</CardTitle>
          <CardDescription>这些开关将保存到项目配置中。</CardDescription>
        </CardHeader>
        <CardContent class="space-y-3">
          <div
            v-for="feature in features"
            :key="feature.key"
            class="flex items-center justify-between gap-4 rounded-lg border p-4"
          >
            <div>
              <p class="font-medium">{{ feature.title }}</p>
              <p class="text-sm text-muted-foreground">{{ feature.description }}</p>
            </div>
            <Switch
              :data-testid="`${feature.key}-switch`"
              :model-value="featureModel(feature.key).value"
              @update:model-value="featureModel(feature.key).value = $event"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle class="text-base">项目名称</CardTitle></CardHeader>
        <CardContent>
          <Input v-model="name" name="name" required minlength="2" placeholder="例如：官网前端" />
        </CardContent>
      </Card>

      <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
      <div class="flex justify-end">
        <Button :disabled="submitting" type="submit">
          {{ submitting ? '创建中…' : '创建项目' }}
        </Button>
      </div>
    </form>
  </section>
</template>

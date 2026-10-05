<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  buildManualTraceSnippet,
  buildEnvSnippet,
  buildInitSnippet,
  buildInstallSnippet,
  buildBrowserTracesInstallSnippet,
  buildBrowserTracesInitSnippet,
} from '../utils/sdk-setup'
import { updateProjectOrigins, getProject, getProjectConnection } from '../api/monitoring.api'
import type { MonitoringProject } from '../model/types'

const route = useRoute()
const isTracesSetup = computed(() => route.name === 'project-traces-setup')
const groupSlug = computed(() => String(route.params.groupSlug))
const projectSlug = computed(() => String(route.params.projectSlug))
const project = ref<MonitoringProject | null>(null)
const loading = ref(true)
const error = ref('')
const copied = ref('')
const actionError = ref('')
const originsInput = ref('*')
const savingOrigins = ref(false)
const refreshingOrigins = ref(false)
let scopeVersion = 0
onUnmounted(() => {
  scopeVersion++
})

function applyProject(result: MonitoringProject): void {
  project.value = result
  originsInput.value = (result.allowedOrigins ?? ['*']).join('\n')
}

async function saveOrigins(): Promise<void> {
  const version = scopeVersion
  const origins = [
    ...new Set(
      originsInput.value
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ]
  const valid =
    (origins.length === 1 && origins[0] === '*') ||
    origins.every((value) => {
      try {
        const url = new URL(value)
        return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value
      } catch {
        return false
      }
    })
  actionError.value = ''
  if (origins.length > 20) {
    actionError.value = '最多允许 20 个来源。'
    return
  }
  if (!valid) {
    actionError.value = '每行请输入精确的 http(s) Origin，或单独使用 *。'
    return
  }
  savingOrigins.value = true
  try {
    const result = await updateProjectOrigins(groupSlug.value, projectSlug.value, origins)
    if (version === scopeVersion) applyProject(result)
  } catch {
    if (version === scopeVersion) actionError.value = '保存来源设置失败，请重试。'
  } finally {
    if (version === scopeVersion) savingOrigins.value = false
  }
}

async function refreshOrigins(): Promise<void> {
  const version = scopeVersion
  refreshingOrigins.value = true
  actionError.value = ''
  try {
    const result = await getProject(groupSlug.value, projectSlug.value)
    if (version === scopeVersion) applyProject(result)
  } catch {
    if (version === scopeVersion) actionError.value = '刷新来源设置失败，请重试。'
  } finally {
    if (version === scopeVersion) refreshingOrigins.value = false
  }
}

const manualTraceSnippet = buildManualTraceSnippet()
const envSnippet = computed(() => (project.value ? buildEnvSnippet(project.value.dsn) : ''))
const installSnippet = computed(() =>
  isTracesSetup.value ? buildBrowserTracesInstallSnippet() : buildInstallSnippet(),
)
const initSnippet = computed(() =>
  isTracesSetup.value ? buildBrowserTracesInitSnippet() : buildInitSnippet(),
)

async function load(): Promise<void> {
  const version = scopeVersion
  loading.value = true
  error.value = ''
  try {
    const result = await getProject(groupSlug.value, projectSlug.value)
    if (version === scopeVersion) {
      applyProject(result)
    }
  } catch {
    if (version === scopeVersion) error.value = '无法加载 SDK 接入信息'
  } finally {
    if (version === scopeVersion) loading.value = false
  }
}

async function copy(value: string, label: string): Promise<void> {
  const version = scopeVersion
  try {
    await navigator.clipboard.writeText(value)
    if (version === scopeVersion) copied.value = label
  } catch {
    if (version === scopeVersion) actionError.value = '复制失败，请手动复制代码。'
  }
}

async function refreshConnection(): Promise<void> {
  if (!project.value) return
  const version = scopeVersion
  try {
    const connection = await getProjectConnection(groupSlug.value, projectSlug.value)
    if (version === scopeVersion && project.value) {
      project.value.connected = connection.connected
      project.value.lastSeenAt = connection.lastSeenAt
    }
  } catch {
    if (version === scopeVersion) actionError.value = '刷新连接状态失败，请重试。'
  }
}

watch(
  [groupSlug, projectSlug],
  () => {
    scopeVersion++
    project.value = null
    actionError.value = ''
    copied.value = ''
    savingOrigins.value = false
    refreshingOrigins.value = false
    void load()
  },
  { immediate: true },
)
</script>

<template>
  <section class="space-y-6">
    <p v-if="loading" class="text-muted-foreground">正在加载…</p>
    <p v-else-if="error" role="alert" class="text-destructive">{{ error }}</p>
    <template v-else-if="project">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 class="text-2xl font-semibold tracking-tight">
            {{ isTracesSetup ? 'Traces接入' : '基础接入' }}
          </h2>
          <p class="mt-1 text-muted-foreground">
            {{ project.name }} ·
            {{ isTracesSetup ? '接入浏览器页面与 HTTP 性能追踪。' : '接入 Vue 与浏览器错误监控。' }}
          </p>
        </div>
        <Badge :variant="project.connected ? 'default' : 'secondary'">
          {{ project.connected ? '已连接' : '等待连接' }}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle class="text-base">1. 安装 SDK</CardTitle>
          <CardDescription
            >从私有 npm 安装 Vue SDK；包管理器会自动安装其 Core 运行时依赖。</CardDescription
          >
        </CardHeader>
        <CardContent class="space-y-3">
          <pre class="overflow-x-auto rounded-lg bg-muted p-4 text-xs">{{ installSnippet }}</pre>
          <Button variant="outline" @click="copy(installSnippet, '安装命令')">复制安装命令</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-base">2. 配置 DSN</CardTitle>
          <CardDescription>将项目 DSN 写入业务项目的 .env.local。</CardDescription>
        </CardHeader>
        <CardContent class="space-y-3">
          <pre class="overflow-x-auto rounded-lg bg-muted p-4 text-xs">{{ project.dsn }}</pre>
          <Button data-testid="copy-dsn" variant="outline" @click="copy(project.dsn, 'DSN')"
            >复制 DSN</Button
          >
          <pre class="overflow-x-auto rounded-lg bg-muted p-4 text-xs">{{ envSnippet }}</pre>
          <Button variant="outline" @click="copy(envSnippet, '环境变量')">复制环境变量</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-base">3. 初始化 SDK</CardTitle>
          <CardDescription>
            <template v-if="isTracesSetup"
              >在业务项目的 main.ts 中初始化，自动采集页面加载、Vue Router 导航及
              fetch/XHR。已有基础接入时，请更新原初始化配置，只初始化一次。</template
            >
            <template v-else
              >在业务项目的 main.ts 中初始化。初始化时会发送连接报告，并自动捕获 Vue、window.error
              和 unhandledrejection 错误；captureException 用于手动验证或手动上报。</template
            >
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-3">
          <pre
            data-testid="init-snippet"
            class="overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-4 text-xs text-slate-100"
            >{{ initSnippet }}</pre>
          <div class="flex flex-wrap gap-2">
            <Button
              data-testid="copy-init"
              variant="outline"
              @click="copy(initSnippet, '初始化代码')"
              >复制初始化代码</Button
            >
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
      <Card v-if="isTracesSetup" data-testid="manual-trace-setup">
        <CardHeader>
          <CardTitle class="text-base">4. 手动触发 Trace</CardTitle>
          <CardDescription>
            将以下代码放入业务项目的 Vue 组件，点击按钮即可记录一次业务操作及其子操作。
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <p class="text-sm text-muted-foreground">
            先在项目功能配置中开启 Traces，并完成上方 SDK 初始化。测试时将 tracesSampleRate 设为
            1；手动 Trace 同样受采样配置影响。
          </p>
          <pre
            data-testid="manual-trace-snippet"
            class="overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-4 text-xs text-slate-100"
            >{{ manualTraceSnippet }}</pre>
          <Button
            data-testid="copy-manual-trace"
            variant="outline"
            @click="copy(manualTraceSnippet, '手动 Trace 示例')"
          >
            复制手动 Trace 示例
          </Button>
          <p
            v-if="copied === '手动 Trace 示例'"
            role="status"
            class="text-sm text-muted-foreground"
          >
            已复制手动 Trace 示例
          </p>
          <p class="text-sm text-muted-foreground">
            startSpan 会在同步回调返回或异步回调完成时自动结束，异常会标记为 error 并继续抛出；
            子操作通过 parent 关联。如果需要自行控制结束时机，可使用 startInactiveSpan，
            并在操作完成时调用 span.end('ok')，失败时调用 span.end('error')。
          </p>
          <p class="text-sm text-muted-foreground">
            点击后进入“查看 Traces”，快捷查询选择“全部 spans”，按 span.name 等于“手动 Trace 测试”
            筛选，再点击“更新图表”。在 Span Samples 中点击记录名称查看完整链路；
            默认“页面性能”筛选不会显示此 business 操作。
          </p>
        </CardContent>
      </Card>
      <Card data-testid="origins-settings">
        <CardHeader>
          <CardTitle class="text-base">可选：限制 SDK 上报来源</CardTitle>
          <CardDescription
            >默认允许任意来源。最多 20 个来源，每行填写一个精确的 http(s) Origin，或单独填写
            *；留空表示不允许浏览器来源。</CardDescription
          >
        </CardHeader>
        <CardContent class="space-y-3">
          <p data-testid="allowed-origins" class="text-sm">
            {{
              project.allowedOrigins?.includes('*') || !project.allowedOrigins
                ? '允许任意来源'
                : project.allowedOrigins.length
                  ? project.allowedOrigins.join('、')
                  : '不允许浏览器来源'
            }}
          </p>
          <label for="sdk-origins" class="text-sm">允许的来源（每行一个）</label>
          <textarea
            id="sdk-origins"
            v-model="originsInput"
            data-testid="origins-input"
            class="min-h-24 w-full rounded border p-3 text-sm"
          />
          <div class="flex flex-wrap gap-2">
            <Button
              data-testid="save-origins"
              :disabled="savingOrigins || refreshingOrigins"
              @click="saveOrigins"
              >{{ savingOrigins ? '正在保存…' : '保存来源设置' }}</Button
            >
            <Button
              data-testid="refresh-origins"
              variant="outline"
              :disabled="savingOrigins || refreshingOrigins"
              @click="refreshOrigins"
              >刷新来源设置</Button
            >
          </div>
          <p v-if="actionError" role="alert" class="text-destructive">{{ actionError }}</p>
        </CardContent>
      </Card>
    </template>
  </section>
</template>

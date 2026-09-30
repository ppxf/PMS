<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  archiveProjectIssue,
  deleteProjectIssue,
  getProjectIssue,
  permanentlyDeleteProjectIssue,
  restoreProjectIssue,
  updateProjectIssueStatus,
} from '../api/monitoring.api'
import type { MonitoringIssueDetail } from '../model/types'

const route = useRoute()
const router = useRouter()
const groupSlug = String(route.params.groupSlug)
const projectSlug = String(route.params.projectSlug)
const issueId = String(route.params.issueId)
const issue = ref<MonitoringIssueDetail | null>(null)
const error = ref('')
const statusUpdating = ref(false)
const headersExpanded = ref(false)
const cookiesExpanded = ref(false)
const actionPending = ref(false)
const archiveDialogOpen = ref(false)
const deleteDialogOpen = ref(false)
const permanentConfirmOpen = ref(false)
const archiveMode = ref<'permanent' | 'until_count'>('permanent')
const archiveThreshold = ref<10 | 100 | 1000>(10)
const defaultRequestEntryCount = 5

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString()
}

const tags = computed(() => Object.entries(issue.value?.latestEvent?.tags ?? {}))
const requestHeaders = computed(() => sortedEntries(issue.value?.latestEvent?.contexts?.request?.headers))
const requestCookies = computed(() => sortedEntries(issue.value?.latestEvent?.contexts?.request?.cookies))
const visibleRequestHeaders = computed(() =>
  headersExpanded.value ? requestHeaders.value : requestHeaders.value.slice(0, defaultRequestEntryCount),
)
const visibleRequestCookies = computed(() =>
  cookiesExpanded.value ? requestCookies.value : requestCookies.value.slice(0, defaultRequestEntryCount),
)
const availableArchiveThresholds = computed(() =>
  ([10, 100, 1000] as const).filter((threshold) => threshold > (issue.value?.eventCount ?? 0)),
)

function sortedEntries(value: Record<string, string> | undefined): [string, string][] {
  return Object.entries(value ?? {}).sort(([left], [right]) => left.localeCompare(right))
}

function formatBytes(value: number | undefined): string {
  if (value === undefined) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / 1024 ** 2).toFixed(1)} MiB`
}

function formatBrowser(): string {
  const browser = issue.value?.latestEvent?.contexts?.browser
  return [browser?.name, browser?.version].filter(Boolean).join(' ') || '-'
}

async function loadIssue(): Promise<void> {
  error.value = ''
  try {
    issue.value = await getProjectIssue(groupSlug, projectSlug, issueId)
  } catch {
    error.value = '无法加载错误详情'
  }
}

async function toggleIssueStatus(): Promise<void> {
  if (!issue.value || statusUpdating.value) return
  statusUpdating.value = true
  error.value = ''
  try {
    const status = issue.value.status === 'unresolved' ? 'resolved' : 'unresolved'
    issue.value = await updateProjectIssueStatus(groupSlug, projectSlug, issueId, status)
  } catch {
    error.value = '无法更新错误状态'
  } finally {
    statusUpdating.value = false
  }
}

async function archiveIssue(): Promise<void> {
  if (!issue.value || actionPending.value) return
  actionPending.value = true
  error.value = ''
  try {
    issue.value = await archiveProjectIssue(
      groupSlug,
      projectSlug,
      issueId,
      archiveMode.value === 'permanent'
        ? { mode: 'permanent' }
        : { mode: 'until_count', threshold: archiveThreshold.value },
    )
    archiveDialogOpen.value = false
  } catch {
    error.value = '无法归档错误'
  } finally {
    actionPending.value = false
  }
}

function openArchiveDialog(): void {
  archiveMode.value = 'permanent'
  archiveThreshold.value = availableArchiveThresholds.value[0] ?? 1000
  archiveDialogOpen.value = true
}

async function restoreIssue(): Promise<void> {
  if (!issue.value || actionPending.value) return
  actionPending.value = true
  error.value = ''
  try {
    issue.value = await restoreProjectIssue(groupSlug, projectSlug, issueId)
  } catch {
    error.value = '无法恢复错误'
  } finally {
    actionPending.value = false
  }
}

async function deleteIssue(): Promise<void> {
  if (actionPending.value) return
  actionPending.value = true
  error.value = ''
  try {
    await deleteProjectIssue(groupSlug, projectSlug, issueId)
    await router.push({ name: 'project-issues' })
  } catch {
    error.value = '无法删除错误'
  } finally {
    actionPending.value = false
  }
}

function continuePermanentDelete(): void {
  deleteDialogOpen.value = false
  permanentConfirmOpen.value = true
}

async function permanentlyDeleteIssue(): Promise<void> {
  if (actionPending.value) return
  actionPending.value = true
  error.value = ''
  try {
    await permanentlyDeleteProjectIssue(groupSlug, projectSlug, issueId)
    await router.push({ name: 'project-issues' })
  } catch {
    error.value = '无法永久删除错误'
  } finally {
    actionPending.value = false
  }
}

onMounted(loadIssue)
</script>

<template>
  <section class="space-y-6">
    <div v-if="error" role="alert" class="space-y-3 text-destructive">
      <p>{{ error }}</p>
      <Button type="button" variant="outline" size="sm" @click="loadIssue">重试</Button>
    </div>

    <template v-else-if="issue">
      <div>
        <div class="flex flex-wrap items-center gap-3">
          <h2 class="text-2xl font-semibold tracking-tight">{{ issue.title }}</h2>
          <Badge
            data-testid="issue-status"
            :variant="issue.status === 'resolved' ? 'success' : 'secondary'"
          >
            {{ issue.status === 'unresolved' ? '未解决' : '已解决' }}
          </Badge>
          <Badge
            data-testid="issue-count"
            :variant="issue.status === 'resolved' ? 'success' : 'destructive'"
          >{{ issue.eventCount }} 次</Badge>
          <Button
            data-testid="issue-status-action"
            type="button"
            size="sm"
            variant="outline"
            :disabled="statusUpdating"
            @click="toggleIssueStatus"
          >{{ issue.status === 'unresolved' ? '标记为已解决' : '重新打开' }}</Button>
          <template v-if="issue.visibility === 'active'">
            <Button
              data-testid="archive-issue"
              type="button"
              size="sm"
              variant="outline"
              @click="openArchiveDialog"
            >归档</Button>
            <Button
              data-testid="delete-issue"
              type="button"
              size="sm"
              variant="destructive"
              @click="deleteDialogOpen = true"
            >删除</Button>
          </template>
          <Button
            v-else
            data-testid="restore-issue"
            type="button"
            size="sm"
            variant="outline"
            :disabled="actionPending"
            @click="restoreIssue"
          >恢复</Button>
        </div>
        <p class="mt-1 text-muted-foreground">{{ issue.exceptionType }} · {{ issue.culprit ?? '-' }}</p>
        <p
          v-if="issue.resolutionReason === 'auto_inactivity' && issue.resolvedAt"
          data-testid="resolution-summary"
          class="mt-2 text-sm text-muted-foreground"
        >
          连续 7 天未再次出现，已自动解决 · {{ formatDate(issue.resolvedAt) }}
        </p>
        <p
          v-else-if="issue.resolutionReason === 'manual' && issue.resolvedAt"
          data-testid="resolution-summary"
          class="mt-2 text-sm text-muted-foreground"
        >
          手动标记为已解决 · {{ formatDate(issue.resolvedAt) }}
        </p>
        <p v-if="issue.reopenedAt && issue.reopenCount > 0" class="mt-2 text-sm text-muted-foreground">
          最近重新打开：{{ formatDate(issue.reopenedAt) }} · 重新打开 {{ issue.reopenCount }} 次
        </p>
        <p
          v-if="issue.visibility !== 'active'"
          class="mt-2 text-sm text-muted-foreground"
        >
          {{ issue.visibility === 'archived_permanent'
            ? '永久归档'
            : `达到 ${issue.archiveThreshold} 次后恢复` }}
          <template v-if="issue.archivedAt"> · {{ formatDate(issue.archivedAt) }}</template>
        </p>
        <dl class="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div>
            <dt class="inline text-muted-foreground">首次出现：</dt>
            <dd data-testid="first-seen-at" class="inline">{{ formatDate(issue.firstSeenAt) }}</dd>
          </div>
          <div>
            <dt class="inline text-muted-foreground">最近出现：</dt>
            <dd data-testid="last-seen-at" class="inline">{{ formatDate(issue.lastSeenAt) }}</dd>
          </div>
        </dl>
      </div>

      <Card>
        <CardHeader><CardTitle class="text-base">最新事件</CardTitle></CardHeader>
        <CardContent v-if="issue.latestEvent" class="space-y-4">
          <dl class="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt class="text-muted-foreground">时间</dt><dd>{{ formatDate(issue.latestEvent.timestamp) }}</dd></div>
            <div><dt class="text-muted-foreground">来源</dt><dd>{{ issue.latestEvent.source }}</dd></div>
            <div><dt class="text-muted-foreground">URL</dt><dd class="break-all">{{ issue.latestEvent.url ?? '-' }}</dd></div>
            <div><dt class="text-muted-foreground">环境</dt><dd>{{ issue.latestEvent.environment ?? '-' }}</dd></div>
          </dl>
          <div>
            <h3 class="mb-2 text-sm font-medium">标签</h3>
            <dl v-if="tags.length" class="grid gap-2 text-sm sm:grid-cols-2">
              <div v-for="[key, value] in tags" :key="key" class="flex gap-2 rounded border p-2">
                <dt class="text-muted-foreground">{{ key }}</dt><dd>{{ value }}</dd>
              </div>
            </dl>
            <p v-else>-</p>
          </div>
          <div>
            <h3 class="mb-2 text-sm font-medium">堆栈</h3>
            <pre class="whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-sm">{{ issue.latestEvent.stacktrace ?? '无堆栈' }}</pre>
          </div>
        </CardContent>
        <CardContent v-else class="text-muted-foreground">暂无最新事件</CardContent>
      </Card>

      <Dialog v-model:open="archiveDialogOpen">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>归档错误</DialogTitle>
            <DialogDescription>归档期间仍会记录事件并累计次数。</DialogDescription>
          </DialogHeader>
          <div class="space-y-3 text-sm">
            <label class="flex items-center gap-2">
              <input v-model="archiveMode" type="radio" value="permanent">
              永久归档
            </label>
            <label class="flex items-center gap-2">
              <input
                v-model="archiveMode"
                data-testid="archive-mode-until-count"
                type="radio"
                value="until_count"
                :disabled="availableArchiveThresholds.length === 0"
              >
              按累计次数归档
            </label>
            <div class="flex flex-wrap gap-3 pl-6">
              <label v-for="threshold in [10, 100, 1000] as const" :key="threshold">
                <input
                  v-model="archiveThreshold"
                  type="radio"
                  name="archive-threshold"
                  :value="threshold"
                  :disabled="archiveMode !== 'until_count' || threshold <= issue.eventCount"
                  :data-testid="`archive-threshold-${threshold}`"
                >
                {{ threshold }} 次
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" @click="archiveDialogOpen = false">取消</Button>
            <Button
              data-testid="confirm-archive"
              type="button"
              :disabled="actionPending"
              @click="archiveIssue"
            >确认归档</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog v-model:open="deleteDialogOpen">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除错误</DialogTitle>
            <DialogDescription>删除会同时清除这条错误的全部历史事件。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              data-testid="confirm-delete-once"
              type="button"
              variant="outline"
              :disabled="actionPending"
              @click="deleteIssue"
            >删除这条错误</Button>
            <Button
              data-testid="choose-permanent-delete"
              type="button"
              variant="destructive"
              @click="continuePermanentDelete"
            >永久删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog v-model:open="permanentConfirmOpen">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>再次确认永久删除</DialogTitle>
            <DialogDescription>
              此操作不可恢复，当前历史数据会被清除，未来相同错误也不会被记录。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" @click="permanentConfirmOpen = false">取消</Button>
            <Button
              data-testid="confirm-permanent-delete"
              type="button"
              variant="destructive"
              :disabled="actionPending"
              @click="permanentlyDeleteIssue"
            >确认永久删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader><CardTitle class="text-base">请求信息</CardTitle></CardHeader>
        <CardContent class="space-y-5">
          <div>
            <h3 class="mb-2 text-sm font-medium">URL</h3>
            <p class="break-all text-sm">{{ issue.latestEvent?.url ?? '-' }}</p>
          </div>
          <div>
            <h3 class="mb-2 text-sm font-medium">Headers</h3>
            <dl v-if="requestHeaders.length" class="space-y-2 text-sm">
              <div v-for="[key, value] in visibleRequestHeaders" :key="key" data-testid="request-header-row" class="grid gap-1 rounded border p-2 sm:grid-cols-[180px_1fr]">
                <dt class="text-muted-foreground">{{ key }}</dt><dd class="break-all">{{ value }}</dd>
              </div>
            </dl>
            <p v-else class="text-sm text-muted-foreground">-</p>
            <Button
              v-if="requestHeaders.length > defaultRequestEntryCount"
              data-testid="request-headers-toggle"
              type="button"
              variant="ghost"
              size="sm"
              class="mt-2"
              @click="headersExpanded = !headersExpanded"
            >{{ headersExpanded ? '收起' : `展开全部（${requestHeaders.length}）` }}</Button>
          </div>
          <div>
            <h3 class="mb-2 text-sm font-medium">Cookies</h3>
            <dl v-if="requestCookies.length" class="space-y-2 text-sm">
              <div v-for="[key, value] in visibleRequestCookies" :key="key" data-testid="request-cookie-row" class="grid gap-1 rounded border p-2 sm:grid-cols-[180px_1fr]">
                <dt class="text-muted-foreground">{{ key }}</dt><dd class="break-all">{{ value }}</dd>
              </div>
            </dl>
            <p v-else class="text-sm text-muted-foreground">-</p>
            <Button
              v-if="requestCookies.length > defaultRequestEntryCount"
              data-testid="request-cookies-toggle"
              type="button"
              variant="ghost"
              size="sm"
              class="mt-2"
              @click="cookiesExpanded = !cookiesExpanded"
            >{{ cookiesExpanded ? '收起' : `展开全部（${requestCookies.length}）` }}</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle class="text-base">浏览器上下文</CardTitle></CardHeader>
        <CardContent class="grid gap-6 lg:grid-cols-2">
          <dl class="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt class="text-muted-foreground">浏览器</dt><dd>{{ formatBrowser() }}</dd></div>
            <div><dt class="text-muted-foreground">操作系统</dt><dd>{{ issue.latestEvent?.contexts?.os?.name ?? '-' }}</dd></div>
            <div><dt class="text-muted-foreground">平台</dt><dd>{{ issue.latestEvent?.contexts?.device?.platform ?? '-' }}</dd></div>
            <div><dt class="text-muted-foreground">屏幕</dt><dd>{{ issue.latestEvent?.contexts?.device?.screenWidth ?? '-' }} × {{ issue.latestEvent?.contexts?.device?.screenHeight ?? '-' }}</dd></div>
            <div><dt class="text-muted-foreground">视口</dt><dd>{{ issue.latestEvent?.contexts?.device?.viewportWidth ?? '-' }} × {{ issue.latestEvent?.contexts?.device?.viewportHeight ?? '-' }}</dd></div>
            <div><dt class="text-muted-foreground">像素比</dt><dd>{{ issue.latestEvent?.contexts?.device?.pixelRatio ?? '-' }}</dd></div>
            <div><dt class="text-muted-foreground">语言</dt><dd>{{ issue.latestEvent?.contexts?.culture?.locale ?? '-' }}</dd></div>
            <div><dt class="text-muted-foreground">语言列表</dt><dd>{{ issue.latestEvent?.contexts?.culture?.languages?.join(', ') || '-' }}</dd></div>
            <div><dt class="text-muted-foreground">时区</dt><dd>{{ issue.latestEvent?.contexts?.culture?.timezone ?? '-' }}</dd></div>
          </dl>
          <div>
            <h3 class="mb-3 text-sm font-medium">内存</h3>
            <dl class="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt class="text-muted-foreground">JS 堆已用</dt><dd>{{ formatBytes(issue.latestEvent?.contexts?.memory?.usedJSHeapSize) }}</dd></div>
              <div><dt class="text-muted-foreground">JS 堆总量</dt><dd>{{ formatBytes(issue.latestEvent?.contexts?.memory?.totalJSHeapSize) }}</dd></div>
              <div><dt class="text-muted-foreground">JS 堆上限</dt><dd>{{ formatBytes(issue.latestEvent?.contexts?.memory?.jsHeapSizeLimit) }}</dd></div>
              <div><dt class="text-muted-foreground">设备内存</dt><dd>{{ issue.latestEvent?.contexts?.memory?.deviceMemoryGiB !== undefined ? `${issue.latestEvent.contexts.memory.deviceMemoryGiB} GiB` : '-' }}</dd></div>
            </dl>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle class="text-base">最近事件</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>时间</TableHead><TableHead>来源</TableHead><TableHead>环境</TableHead><TableHead>信息</TableHead></TableRow></TableHeader>
            <TableBody>
              <TableRow v-for="event in issue.recentEvents" :key="event.id">
                <TableCell>{{ formatDate(event.timestamp) }}</TableCell>
                <TableCell>{{ event.source }}</TableCell>
                <TableCell>{{ event.environment ?? '-' }}</TableCell>
                <TableCell>{{ event.exceptionValue }}</TableCell>
              </TableRow>
              <TableRow v-if="issue.recentEvents.length === 0"><TableCell :colspan="4" class="text-center">暂无最近事件</TableCell></TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getProjectIssue } from '../api/monitoring.api'
import type { MonitoringIssueDetail } from '../model/types'

const route = useRoute()
const groupSlug = String(route.params.groupSlug)
const projectSlug = String(route.params.projectSlug)
const issueId = String(route.params.issueId)
const issue = ref<MonitoringIssueDetail | null>(null)
const error = ref('')

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString()
}

const tags = computed(() => Object.entries(issue.value?.latestEvent?.tags ?? {}))

async function loadIssue(): Promise<void> {
  error.value = ''
  try {
    issue.value = await getProjectIssue(groupSlug, projectSlug, issueId)
  } catch {
    error.value = '无法加载错误详情'
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
          <Badge data-testid="issue-status" variant="secondary">
            {{ issue.status === 'unresolved' ? '未解决' : issue.status }}
          </Badge>
          <Badge variant="destructive">{{ issue.eventCount }} 次</Badge>
        </div>
        <p class="mt-1 text-muted-foreground">{{ issue.exceptionType }} · {{ issue.culprit ?? '-' }}</p>
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
            <div><dt class="text-muted-foreground">版本</dt><dd>{{ issue.latestEvent.release ?? '-' }}</dd></div>
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

      <Card>
        <CardHeader><CardTitle class="text-base">最近事件</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>时间</TableHead><TableHead>来源</TableHead><TableHead>环境</TableHead><TableHead>版本</TableHead><TableHead>信息</TableHead></TableRow></TableHeader>
            <TableBody>
              <TableRow v-for="event in issue.recentEvents" :key="event.id">
                <TableCell>{{ formatDate(event.timestamp) }}</TableCell>
                <TableCell>{{ event.source }}</TableCell>
                <TableCell>{{ event.environment ?? '-' }}</TableCell>
                <TableCell>{{ event.release ?? '-' }}</TableCell>
                <TableCell>{{ event.exceptionValue }}</TableCell>
              </TableRow>
              <TableRow v-if="issue.recentEvents.length === 0"><TableCell :colspan="5" class="text-center">暂无最近事件</TableCell></TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </template>
  </section>
</template>

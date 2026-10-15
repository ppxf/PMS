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
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('en-US')
}

const tags = computed(() => Object.entries(issue.value?.latestEvent?.tags ?? {}))
const requestHeaders = computed(() =>
  sortedEntries(issue.value?.latestEvent?.contexts?.request?.headers),
)
const requestCookies = computed(() =>
  sortedEntries(issue.value?.latestEvent?.contexts?.request?.cookies),
)
const visibleRequestHeaders = computed(() =>
  headersExpanded.value
    ? requestHeaders.value
    : requestHeaders.value.slice(0, defaultRequestEntryCount),
)
const visibleRequestCookies = computed(() =>
  cookiesExpanded.value
    ? requestCookies.value
    : requestCookies.value.slice(0, defaultRequestEntryCount),
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
    error.value = 'Unable to load issue details'
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
    error.value = 'Unable to update issue status'
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
    error.value = 'Unable to archive issue'
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
    error.value = 'Unable to restore issue'
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
    error.value = 'Unable to delete issue'
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
    error.value = 'Unable to permanently delete issue'
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
      <Button type="button" variant="outline" size="sm" @click="loadIssue">Retry</Button>
    </div>

    <template v-else-if="issue">
      <div>
        <div class="flex flex-wrap items-center gap-3">
          <h2 class="text-2xl font-semibold tracking-tight">{{ issue.title }}</h2>
          <Badge
            data-testid="issue-status"
            :variant="issue.status === 'resolved' ? 'success' : 'secondary'"
          >
            {{ issue.status === 'unresolved' ? 'Unresolved' : 'Resolved' }}
          </Badge>
          <Badge
            data-testid="issue-count"
            :variant="issue.status === 'resolved' ? 'success' : 'destructive'"
            >{{ issue.eventCount.toLocaleString('en-US') }}
            {{ issue.eventCount === 1 ? 'event' : 'events' }}</Badge
          >
          <Button
            data-testid="issue-status-action"
            type="button"
            size="sm"
            variant="outline"
            :disabled="statusUpdating"
            @click="toggleIssueStatus"
            >{{ issue.status === 'unresolved' ? 'Mark as resolved' : 'Reopen' }}</Button
          >
          <template v-if="issue.visibility === 'active'">
            <Button
              data-testid="archive-issue"
              type="button"
              size="sm"
              variant="outline"
              @click="openArchiveDialog"
              >Archive</Button
            >
            <Button
              data-testid="delete-issue"
              type="button"
              size="sm"
              variant="destructive"
              @click="deleteDialogOpen = true"
              >Delete</Button
            >
          </template>
          <Button
            v-else
            data-testid="restore-issue"
            type="button"
            size="sm"
            variant="outline"
            :disabled="actionPending"
            @click="restoreIssue"
            >Restore</Button
          >
        </div>
        <p class="mt-1 text-muted-foreground">
          {{ issue.exceptionType }} · {{ issue.culprit ?? '-' }}
        </p>
        <p
          v-if="issue.resolutionReason === 'auto_inactivity' && issue.resolvedAt"
          data-testid="resolution-summary"
          class="mt-2 text-sm text-muted-foreground"
        >
          Automatically resolved after 7 days without recurrence ·
          {{ formatDate(issue.resolvedAt) }}
        </p>
        <p
          v-else-if="issue.resolutionReason === 'manual' && issue.resolvedAt"
          data-testid="resolution-summary"
          class="mt-2 text-sm text-muted-foreground"
        >
          Manually resolved · {{ formatDate(issue.resolvedAt) }}
        </p>
        <p
          v-if="issue.reopenedAt && issue.reopenCount > 0"
          class="mt-2 text-sm text-muted-foreground"
        >
          Last reopened: {{ formatDate(issue.reopenedAt) }} · Reopened
          {{ issue.reopenCount.toLocaleString('en-US') }}
          {{ issue.reopenCount === 1 ? 'time' : 'times' }}
        </p>
        <p v-if="issue.visibility !== 'active'" class="mt-2 text-sm text-muted-foreground">
          {{
            issue.visibility === 'archived_permanent'
              ? 'Archive permanently'
              : `Restore after ${issue.archiveThreshold?.toLocaleString('en-US')} events`
          }}
          <template v-if="issue.archivedAt"> · {{ formatDate(issue.archivedAt) }}</template>
        </p>
        <dl class="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div>
            <dt class="inline text-muted-foreground">First seen:</dt>
            <dd data-testid="first-seen-at" class="inline">{{ formatDate(issue.firstSeenAt) }}</dd>
          </div>
          <div>
            <dt class="inline text-muted-foreground">Last seen:</dt>
            <dd data-testid="last-seen-at" class="inline">{{ formatDate(issue.lastSeenAt) }}</dd>
          </div>
        </dl>
      </div>

      <Card>
        <CardHeader><CardTitle class="text-base">Latest event</CardTitle></CardHeader>
        <CardContent v-if="issue.latestEvent" class="space-y-4">
          <dl class="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt class="text-muted-foreground">Time</dt>
              <dd>{{ formatDate(issue.latestEvent.timestamp) }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Source</dt>
              <dd>{{ issue.latestEvent.source }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">URL</dt>
              <dd class="break-all">{{ issue.latestEvent.url ?? '-' }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Environment</dt>
              <dd>{{ issue.latestEvent.environment ?? '-' }}</dd>
            </div>
          </dl>
          <div>
            <h3 class="mb-2 text-sm font-medium">Tags</h3>
            <dl v-if="tags.length" class="grid gap-2 text-sm sm:grid-cols-2">
              <div v-for="[key, value] in tags" :key="key" class="flex gap-2 rounded border p-2">
                <dt class="text-muted-foreground">{{ key }}</dt>
                <dd>{{ value }}</dd>
              </div>
            </dl>
            <p v-else>-</p>
          </div>
          <div>
            <h3 class="mb-2 text-sm font-medium">Stack trace</h3>
            <pre class="whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-sm">{{
              issue.latestEvent.stacktrace ?? 'No stack trace'
            }}</pre>
          </div>
        </CardContent>
        <CardContent v-else class="text-muted-foreground">No latest event</CardContent>
      </Card>

      <Dialog v-model:open="archiveDialogOpen">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive issue</DialogTitle>
            <DialogDescription
              >Events will still be recorded and counted while archived.</DialogDescription
            >
          </DialogHeader>
          <div class="space-y-3 text-sm">
            <label class="flex items-center gap-2">
              <input v-model="archiveMode" type="radio" value="permanent" />
              Archive permanently
            </label>
            <label class="flex items-center gap-2">
              <input
                v-model="archiveMode"
                data-testid="archive-mode-until-count"
                type="radio"
                value="until_count"
                :disabled="availableArchiveThresholds.length === 0"
              />
              Archive until an event count is reached
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
                />
                {{ threshold.toLocaleString('en-US') }} events
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" @click="archiveDialogOpen = false"
              >Cancel</Button
            >
            <Button
              data-testid="confirm-archive"
              type="button"
              :disabled="actionPending"
              @click="archiveIssue"
              >Confirm archive</Button
            >
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog v-model:open="deleteDialogOpen">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete issue</DialogTitle>
            <DialogDescription
              >Deleting this issue also removes all its historical events.</DialogDescription
            >
          </DialogHeader>
          <DialogFooter>
            <Button
              data-testid="confirm-delete-once"
              type="button"
              variant="outline"
              :disabled="actionPending"
              @click="deleteIssue"
              >Delete this issue</Button
            >
            <Button
              data-testid="choose-permanent-delete"
              type="button"
              variant="destructive"
              @click="continuePermanentDelete"
              >Delete permanently</Button
            >
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog v-model:open="permanentConfirmOpen">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm permanent deletion</DialogTitle>
            <DialogDescription>
              This action cannot be undone. Existing history will be removed, and future occurrences
              of this issue will no longer be recorded.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" @click="permanentConfirmOpen = false"
              >Cancel</Button
            >
            <Button
              data-testid="confirm-permanent-delete"
              type="button"
              variant="destructive"
              :disabled="actionPending"
              @click="permanentlyDeleteIssue"
              >Confirm permanent deletion</Button
            >
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader><CardTitle class="text-base">Request information</CardTitle></CardHeader>
        <CardContent class="space-y-5">
          <div>
            <h3 class="mb-2 text-sm font-medium">URL</h3>
            <p class="break-all text-sm">{{ issue.latestEvent?.url ?? '-' }}</p>
          </div>
          <div>
            <h3 class="mb-2 text-sm font-medium">Headers</h3>
            <dl v-if="requestHeaders.length" class="space-y-2 text-sm">
              <div
                v-for="[key, value] in visibleRequestHeaders"
                :key="key"
                data-testid="request-header-row"
                class="grid gap-1 rounded border p-2 sm:grid-cols-[180px_1fr]"
              >
                <dt class="text-muted-foreground">{{ key }}</dt>
                <dd class="break-all">{{ value }}</dd>
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
              >{{ headersExpanded ? 'Collapse' : `Show all (${requestHeaders.length})` }}</Button
            >
          </div>
          <div>
            <h3 class="mb-2 text-sm font-medium">Cookies</h3>
            <dl v-if="requestCookies.length" class="space-y-2 text-sm">
              <div
                v-for="[key, value] in visibleRequestCookies"
                :key="key"
                data-testid="request-cookie-row"
                class="grid gap-1 rounded border p-2 sm:grid-cols-[180px_1fr]"
              >
                <dt class="text-muted-foreground">{{ key }}</dt>
                <dd class="break-all">{{ value }}</dd>
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
              >{{ cookiesExpanded ? 'Collapse' : `Show all (${requestCookies.length})` }}</Button
            >
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle class="text-base">Browser context</CardTitle></CardHeader>
        <CardContent class="grid gap-6 lg:grid-cols-2">
          <dl class="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt class="text-muted-foreground">Browser</dt>
              <dd>{{ formatBrowser() }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Operating system</dt>
              <dd>{{ issue.latestEvent?.contexts?.os?.name ?? '-' }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Platform</dt>
              <dd>{{ issue.latestEvent?.contexts?.device?.platform ?? '-' }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Screen</dt>
              <dd>
                {{ issue.latestEvent?.contexts?.device?.screenWidth ?? '-' }} ×
                {{ issue.latestEvent?.contexts?.device?.screenHeight ?? '-' }}
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Viewport</dt>
              <dd>
                {{ issue.latestEvent?.contexts?.device?.viewportWidth ?? '-' }} ×
                {{ issue.latestEvent?.contexts?.device?.viewportHeight ?? '-' }}
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Pixel ratio</dt>
              <dd>{{ issue.latestEvent?.contexts?.device?.pixelRatio ?? '-' }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Language</dt>
              <dd>{{ issue.latestEvent?.contexts?.culture?.locale ?? '-' }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Languages</dt>
              <dd>{{ issue.latestEvent?.contexts?.culture?.languages?.join(', ') || '-' }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Time zone</dt>
              <dd>{{ issue.latestEvent?.contexts?.culture?.timezone ?? '-' }}</dd>
            </div>
          </dl>
          <div>
            <h3 class="mb-3 text-sm font-medium">Memory</h3>
            <dl class="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt class="text-muted-foreground">Used JS heap</dt>
                <dd>{{ formatBytes(issue.latestEvent?.contexts?.memory?.usedJSHeapSize) }}</dd>
              </div>
              <div>
                <dt class="text-muted-foreground">Total JS heap</dt>
                <dd>{{ formatBytes(issue.latestEvent?.contexts?.memory?.totalJSHeapSize) }}</dd>
              </div>
              <div>
                <dt class="text-muted-foreground">JS heap limit</dt>
                <dd>{{ formatBytes(issue.latestEvent?.contexts?.memory?.jsHeapSizeLimit) }}</dd>
              </div>
              <div>
                <dt class="text-muted-foreground">Device memory</dt>
                <dd>
                  {{
                    issue.latestEvent?.contexts?.memory?.deviceMemoryGiB !== undefined
                      ? `${issue.latestEvent.contexts.memory.deviceMemoryGiB} GiB`
                      : '-'
                  }}
                </dd>
              </div>
            </dl>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle class="text-base">Recent events</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader
              ><TableRow
                ><TableHead>Time</TableHead><TableHead>Source</TableHead
                ><TableHead>Environment</TableHead><TableHead>Message</TableHead></TableRow
              ></TableHeader
            >
            <TableBody>
              <TableRow v-for="event in issue.recentEvents" :key="event.id">
                <TableCell>{{ formatDate(event.timestamp) }}</TableCell>
                <TableCell>{{ event.source }}</TableCell>
                <TableCell>{{ event.environment ?? '-' }}</TableCell>
                <TableCell>{{ event.exceptionValue }}</TableCell>
              </TableRow>
              <TableRow v-if="issue.recentEvents.length === 0"
                ><TableCell :colspan="4" class="text-center">No recent events</TableCell></TableRow
              >
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { RouterLink, useRoute } from 'vue-router'
import { createColumnHelper } from '@tanstack/vue-table'
import { DataTable } from '@/components/data-table'
import type { DataTableFeatures } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listProjectIssues } from '../api/monitoring.api'
import type { MonitoringIssueSummary } from '../model/types'

const route = useRoute()
const groupSlug = String(route.params.groupSlug)
const projectSlug = String(route.params.projectSlug)
const issues = ref<MonitoringIssueSummary[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const error = ref('')
const searchInput = ref('')
const search = ref('')
const view = ref<'active' | 'archived'>('active')

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('en-US')
}

const columnHelper = createColumnHelper<DataTableFeatures, MonitoringIssueSummary>()
const baseColumns = [
  columnHelper.accessor('title', {
    header: 'Issue',
    cell: ({ row }) =>
      h(
        RouterLink,
        {
          class: 'font-medium text-primary hover:underline',
          to: {
            name: 'project-issue-detail',
            params: { groupSlug, projectSlug, issueId: row.original.id },
          },
        },
        () => row.original.title,
      ),
  }),
  columnHelper.accessor('exceptionType', { header: 'Exception type' }),
  columnHelper.accessor('source', {
    header: 'Source',
    cell: ({ row }) => row.original.source ?? '-',
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: ({ row }) =>
      h(Badge, { variant: row.original.status === 'resolved' ? 'success' : 'secondary' }, () =>
        row.original.status === 'unresolved' ? 'Unresolved' : 'Resolved',
      ),
  }),
  columnHelper.accessor('eventCount', {
    header: 'Events',
    cell: ({ row }) =>
      h(
        Badge,
        { variant: row.original.status === 'resolved' ? 'success' : 'destructive' },
        () =>
          `${row.original.eventCount.toLocaleString('en-US')} ${row.original.eventCount === 1 ? 'event' : 'events'}`,
      ),
  }),
  columnHelper.accessor('firstSeenAt', {
    header: 'First seen',
    cell: ({ row }) => formatDate(row.original.firstSeenAt),
  }),
  columnHelper.accessor('lastSeenAt', {
    header: 'Last seen',
    cell: ({ row }) => formatDate(row.original.lastSeenAt),
  }),
]
const archiveColumn = columnHelper.accessor('visibility', {
  header: 'Archive mode',
  cell: ({ row }) =>
    h(
      Badge,
      {
        variant: 'secondary',
        'data-testid': `archive-label-${row.original.id}`,
      },
      () =>
        row.original.visibility === 'archived_permanent'
          ? 'Archive permanently'
          : `Restore after ${row.original.archiveThreshold?.toLocaleString('en-US')} events`,
    ),
})
const columns = computed(() =>
  columnHelper.columns(
    view.value === 'archived'
      ? [...baseColumns.slice(0, 5), archiveColumn, ...baseColumns.slice(5)]
      : baseColumns,
  ),
)

async function loadIssues(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const result = await listProjectIssues(groupSlug, projectSlug, {
      page: page.value,
      pageSize: pageSize.value,
      ...(search.value ? { search: search.value } : {}),
      ...(view.value === 'archived' ? { view: 'archived' as const } : {}),
    })
    issues.value = result.items
    total.value = result.total
  } catch {
    error.value = 'Unable to load issues'
  } finally {
    loading.value = false
  }
}

const applySearch = useDebounceFn((value: string) => {
  page.value = 1
  search.value = value.trim()
}, 300)

watch(searchInput, (value) => applySearch(value))
watch([page, pageSize, search, view], loadIssues)
onMounted(loadIssues)

function toggleView(): void {
  page.value = 1
  view.value = view.value === 'active' ? 'archived' : 'active'
}

function issueRowClass(issue: MonitoringIssueSummary): string | undefined {
  if (issue.visibility === 'archived_permanent') {
    return 'bg-slate-50/80 dark:bg-slate-900/40'
  }
  if (issue.visibility === 'archived_until_count') {
    return 'bg-amber-50/60 dark:bg-amber-950/30'
  }
  return undefined
}
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-2xl font-semibold tracking-tight">
          {{ view === 'active' ? 'Issues' : 'Archived issues' }}
        </h2>
        <p class="mt-1 text-muted-foreground">Review grouped frontend errors in this project.</p>
      </div>
      <Button data-testid="show-archived" type="button" variant="outline" @click="toggleView">{{
        view === 'active' ? 'View archived issues' : 'Back to active issues'
      }}</Button>
    </div>

    <Input
      v-model="searchInput"
      class="max-w-md"
      aria-label="Search issues"
      placeholder="Search issues, exception types, sources, statuses, counts, or dates"
    />

    <DataTable
      v-model:page="page"
      v-model:page-size="pageSize"
      :columns="columns"
      :data="issues"
      :error="error"
      :loading="loading"
      :total="total"
      :row-key="(issue) => issue.id"
      :row-class="issueRowClass"
      empty-text="No issues"
      manual-pagination
      @retry="loadIssues"
    />
  </section>
</template>

<script setup lang="ts">
import { h, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { createColumnHelper } from '@tanstack/vue-table'
import { DataTable } from '@/components/data-table'
import type { DataTableFeatures } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
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

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString()
}

const columnHelper = createColumnHelper<DataTableFeatures, MonitoringIssueSummary>()
const columns = columnHelper.columns([
  columnHelper.accessor('title', {
    header: '错误',
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
  columnHelper.accessor('exceptionType', { header: '异常类型' }),
  columnHelper.accessor('source', {
    header: '来源',
    cell: ({ row }) => row.original.source ?? '-',
  }),
  columnHelper.accessor('status', {
    header: '状态',
    cell: ({ row }) =>
      h(Badge, { variant: row.original.status === 'resolved' ? 'success' : 'secondary' }, () =>
        row.original.status === 'unresolved' ? '未解决' : '已解决',
      ),
  }),
  columnHelper.accessor('eventCount', {
    header: '次数',
    cell: ({ row }) =>
      h(
        Badge,
        { variant: row.original.status === 'resolved' ? 'success' : 'destructive' },
        () => `${row.original.eventCount} 次`,
      ),
  }),
  columnHelper.accessor('firstSeenAt', {
    header: '首次出现',
    cell: ({ row }) => formatDate(row.original.firstSeenAt),
  }),
  columnHelper.accessor('lastSeenAt', {
    header: '最近出现',
    cell: ({ row }) => formatDate(row.original.lastSeenAt),
  }),
])

async function loadIssues(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const result = await listProjectIssues(groupSlug, projectSlug, {
      page: page.value,
      pageSize: pageSize.value,
    })
    issues.value = result.items
    total.value = result.total
  } catch {
    error.value = '无法加载错误列表'
  } finally {
    loading.value = false
  }
}

watch([page, pageSize], loadIssues)
onMounted(loadIssues)
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-2xl font-semibold tracking-tight">错误列表</h2>
      <p class="mt-1 text-muted-foreground">查看项目中聚合后的前端错误。</p>
    </div>

    <DataTable
      v-model:page="page"
      v-model:page-size="pageSize"
      :columns="columns"
      :data="issues"
      :error="error"
      :loading="loading"
      :total="total"
      :row-key="(issue) => issue.id"
      empty-text="暂无错误"
      manual-pagination
      @retry="loadIssues"
    />
  </section>
</template>

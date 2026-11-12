<script setup lang="ts">
import {
  ShieldCheck,
  Filter,
  Search,
  Users,
  CalendarDays,
  Check,
  X,
  LoaderCircle,
  ChevronRight,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import TablePagination from '@/components/ui/pagination/TablePagination.vue'

interface AuditRecord {
  id: string
  projectId?: string
  projectName?: string
  actorName?: string
  action?: string
  objectName?: string
  objectType?: string
  objectId?: string
  result?: string
  statusCode?: number
  requestId?: string
  summary?: Record<string, unknown>
  createdAt?: string
}
const props = defineProps<{
  projects: { id: string; name: string; groupName?: string }[]
  records: AuditRecord[]
  total: number
  page: number
  loading: boolean
  error: string
}>()
const projectId = defineModel<string>('projectId', { required: true })
const action = defineModel<string>('action', { required: true })
const actor = defineModel<string>('actor', { required: true })
const from = defineModel<string>('from', { required: true })
const to = defineModel<string>('to', { required: true })
const emit = defineEmits<{ apply: []; retry: []; pageChange: [page: number] }>()
const fieldClass =
  'h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:opacity-50'
function time(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date)
}
function projectName(record: AuditRecord) {
  return (
    record.projectName ??
    props.projects.find((project) => project.id === record.projectId)?.name ??
    'Workspace'
  )
}
</script>

<template>
  <section class="mx-auto min-w-0 max-w-[1440px] space-y-6">
    <header class="flex items-start gap-4">
      <div
        class="grid size-12 shrink-0 place-items-center rounded-xl border bg-background shadow-sm"
      >
        <ShieldCheck class="size-6 text-primary" aria-hidden="true" />
      </div>
      <div class="min-w-0">
        <h2 class="page-title">Audit records</h2>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Track changes to project settings, member access and issue activity.
        </p>
      </div>
    </header>

    <div class="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div class="flex items-center gap-2.5 border-b bg-muted/20 px-5 py-4 sm:px-6">
        <Filter class="size-4 text-muted-foreground" aria-hidden="true" />
        <h3 class="text-sm font-semibold">Filter activity</h3>
        <span class="ml-auto hidden text-xs text-muted-foreground sm:block"
          >Only projects you can audit</span
        >
      </div>
      <form
        data-testid="filters"
        class="grid min-w-0 grid-cols-1 items-end gap-4 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-3 2xl:grid-cols-[1.3fr_1fr_1fr_1.1fr_1.1fr_auto]"
        @submit.prevent="emit('apply')"
      >
        <label class="min-w-0 space-y-2 text-xs font-medium text-muted-foreground">
          <span class="block">Project</span>
          <select
            class="workspace-select"
            v-model="projectId"
            aria-label="Project"
            :class="[fieldClass, 'text-foreground']"
          >
            <option value="">All accessible projects</option>
            <option v-for="project in projects" :key="project.id" :value="project.id">
              {{ project.name }}
            </option>
          </select>
        </label>
        <label class="min-w-0 space-y-2 text-xs font-medium text-muted-foreground">
          <span class="block">Action</span>
          <span class="relative block"
            ><Search
              class="pointer-events-none absolute top-3 left-3 size-4"
              aria-hidden="true" /><Input
              v-model="action"
              aria-label="Action"
              placeholder="Exact action name"
              class="h-10 pl-9 text-foreground"
          /></span>
        </label>
        <label class="min-w-0 space-y-2 text-xs font-medium text-muted-foreground">
          <span class="block">Actor</span>
          <span class="relative block"
            ><Users
              class="pointer-events-none absolute top-3 left-3 size-4"
              aria-hidden="true" /><Input
              v-model="actor"
              aria-label="Actor"
              placeholder="Name or user ID"
              class="h-10 pl-9 text-foreground"
          /></span>
        </label>
        <label class="min-w-0 space-y-2 text-xs font-medium text-muted-foreground"
          ><span class="block">From</span
          ><input
            v-model="from"
            aria-label="From"
            type="datetime-local"
            :class="[fieldClass, 'text-foreground']"
        /></label>
        <label class="min-w-0 space-y-2 text-xs font-medium text-muted-foreground"
          ><span class="block">To</span
          ><input
            v-model="to"
            aria-label="To"
            type="datetime-local"
            :class="[fieldClass, 'text-foreground']"
        /></label>
        <Button type="submit" :disabled="loading" class="h-10 w-full gap-2"
          ><LoaderCircle v-if="loading" class="size-4 animate-spin" aria-hidden="true" /><Search
            v-else
            class="size-4"
            aria-hidden="true"
          />Apply filters</Button
        >
      </form>
    </div>

    <section
      class="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm"
      aria-label="Audit activity"
    >
      <header class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-6">
        <div class="flex items-center gap-2.5">
          <h3 class="text-sm font-semibold">Activity log</h3>
          <span
            class="rounded-full border bg-muted/50 px-2 py-0.5 text-xs tabular-nums text-muted-foreground"
            >{{ total }} records</span
          >
        </div>
        <span class="flex items-center gap-1.5 text-xs text-muted-foreground"
          ><CalendarDays class="size-3.5" aria-hidden="true" />Most recent first</span
        >
      </header>
      <div
        v-if="error"
        role="alert"
        class="m-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
      >
        <p>{{ error }}</p>
        <Button type="button" variant="outline" size="sm" @click="emit('retry')">Retry</Button>
      </div>
      <div
        v-else-if="loading"
        role="status"
        class="flex min-h-72 flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
      >
        <LoaderCircle class="size-6 animate-spin" aria-hidden="true" />Loading audit records…
      </div>
      <div
        v-else-if="!records.length"
        class="flex min-h-80 flex-col items-center justify-center px-6 py-14 text-center"
      >
        <div class="mb-5 grid size-16 place-items-center rounded-2xl border bg-muted/30">
          <ShieldCheck
            class="size-7 text-muted-foreground"
            :stroke-width="1.5"
            aria-hidden="true"
          />
        </div>
        <h4 class="text-base font-semibold">No audit records found</h4>
        <p class="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
          No results match these filters. Try a different project or time range.
        </p>
        <p class="mt-5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck class="size-3.5 shrink-0" aria-hidden="true" />Activity is recorded from the
          time auditing is enabled.
        </p>
      </div>
      <div v-else class="min-w-0 overflow-x-auto">
        <table class="app-table min-w-[880px]">
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Activity</th>
              <th>Project / object</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="record in records"
              :key="record.id"
              class="align-top transition-colors hover:bg-muted/20"
            >
              <td class="whitespace-nowrap !align-top text-xs tabular-nums text-muted-foreground">
                <time :datetime="record.createdAt">{{ time(record.createdAt) }}</time>
              </td>
              <td class="!align-top">
                <div class="flex items-center gap-2">
                  <span
                    class="grid size-7 shrink-0 place-items-center rounded-full border bg-muted text-[10px] font-semibold text-muted-foreground"
                    >{{ (record.actorName || 'System').slice(0, 2).toUpperCase() }}</span
                  ><span class="max-w-40 break-words font-medium">{{
                    record.actorName || 'System'
                  }}</span>
                </div>
              </td>
              <td class="max-w-md !align-top">
                <p class="break-words font-medium">{{ record.action }}</p>
                <details class="group mt-2 text-xs text-muted-foreground">
                  <summary
                    class="flex cursor-pointer list-none items-center gap-1 py-1 hover:text-foreground"
                  >
                    <ChevronRight
                      class="size-3.5 transition-transform group-open:rotate-90"
                      aria-hidden="true"
                    />View change details
                  </summary>
                  <div class="mt-2 space-y-3 rounded-lg border bg-muted/30 p-3">
                    <pre
                      class="max-w-sm whitespace-pre-wrap break-all text-[11px] leading-5 text-foreground"
                      >{{ JSON.stringify(record.summary, null, 2) }}</pre>
                    <p class="break-all font-mono text-[10px]">Request {{ record.requestId }}</p>
                    <p>HTTP {{ record.statusCode }}</p>
                  </div>
                </details>
              </td>
              <td class="max-w-56 !align-top">
                <p class="break-words font-medium">{{ projectName(record) }}</p>
                <p class="mt-1 break-words text-xs text-muted-foreground">
                  {{ record.objectName ?? record.objectType ?? '—' }}
                </p>
                <p
                  v-if="record.objectId"
                  class="mt-1 break-all font-mono text-[10px] text-muted-foreground"
                >
                  {{ record.objectId }}
                </p>
              </td>
              <td class="!align-top">
                <span
                  class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1 text-xs font-medium"
                  :class="
                    record.result === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : record.result === 'failure'
                        ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
                        : 'bg-muted text-muted-foreground'
                  "
                  ><Check v-if="record.result === 'success'" class="size-3" aria-hidden="true" /><X
                    v-else-if="record.result === 'failure'"
                    class="size-3"
                    aria-hidden="true"
                  />{{
                    record.result === 'success'
                      ? 'Success'
                      : record.result === 'failure'
                        ? 'Failed'
                        : (record.result ?? '—')
                  }}</span
                >
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer class="border-t bg-muted/10 px-5 py-4 sm:px-6">
        <TablePagination
          :page="page"
          :total="total"
          :page-size="20"
          :busy="loading"
          unit="records"
          label="Audit pagination"
          @change="emit('pageChange', $event)"
        />
      </footer>
    </section>
  </section>
</template>

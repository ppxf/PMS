<script setup lang="ts">
import { Bug, Filter, Search, CalendarDays, LoaderCircle, Check, ArrowUpRight } from '@lucide/vue'
import type { RouteLocationRaw } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import TablePagination from '@/components/ui/pagination/TablePagination.vue'

interface IssueRecord {
  id: string
  projectId?: string
  projectName?: string
  projectSlug?: string
  groupSlug?: string
  title?: string
  environment?: string
  status?: string
  eventCount?: number
  lastSeenAt?: string
}
const props = defineProps<{
  projects: { id: string; name: string }[]
  groups: { id: string; name: string }[]
  records: IssueRecord[]
  total: number
  page: number
  loading: boolean
  error: string
  detail: (record: IssueRecord) => RouteLocationRaw | undefined
}>()
const projectId = defineModel<string>('projectId', { required: true })
const groupId = defineModel<string>('groupId', { required: true })
const query = defineModel<string>('query', { required: true })
const status = defineModel<string>('status', { required: true })
const environment = defineModel<string>('environment', { required: true })
const from = defineModel<string>('from', { required: true })
const to = defineModel<string>('to', { required: true })
const emit = defineEmits<{ apply: []; retry: []; pageChange: [page: number] }>()
const fieldClass =
  'h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:opacity-50'
function projectName(record: IssueRecord) {
  return (
    record.projectName ??
    props.projects.find((project) => project.id === record.projectId)?.name ??
    'Project'
  )
}
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
</script>

<template>
  <section class="mx-auto min-w-0 max-w-[1440px] space-y-6">
    <header class="flex items-start gap-4">
      <div
        class="grid size-12 shrink-0 place-items-center rounded-xl border bg-background shadow-sm"
      >
        <Bug class="size-6 text-primary" aria-hidden="true" />
      </div>
      <div class="min-w-0">
        <h2 class="page-title">Issue center</h2>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Find and triage errors across the projects you can access.
        </p>
      </div>
    </header>

    <section class="overflow-hidden rounded-xl border bg-card shadow-sm" aria-label="Issue filters">
      <div class="flex items-center gap-2.5 border-b bg-muted/20 px-5 py-4 sm:px-6">
        <Filter class="size-4 text-muted-foreground" aria-hidden="true" />
        <h3 class="text-sm font-semibold">Filter issues</h3>
        <span class="ml-auto hidden text-xs text-muted-foreground sm:block"
          >Project, environment and time</span
        >
      </div>
      <form
        data-testid="filters"
        class="grid min-w-0 grid-cols-1 items-end gap-4 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-4"
        @submit.prevent="emit('apply')"
      >
        <label class="min-w-0 space-y-2 text-xs font-medium text-muted-foreground"
          ><span class="block">Project</span
          ><select
            v-model="projectId"
            aria-label="Project"
            class="workspace-select"
            :class="fieldClass"
          >
            <option value="">All accessible projects</option>
            <option v-for="project in projects" :key="project.id" :value="project.id">
              {{ project.name }}
            </option>
          </select></label
        >
        <label class="min-w-0 space-y-2 text-xs font-medium text-muted-foreground"
          ><span class="block">Group</span
          ><select
            v-model="groupId"
            aria-label="Group"
            class="workspace-select"
            :class="fieldClass"
          >
            <option value="">All groups</option>
            <option v-for="group in groups" :key="group.id" :value="group.id">
              {{ group.name }}
            </option>
          </select></label
        >
        <label class="min-w-0 space-y-2 text-xs font-medium text-muted-foreground"
          ><span class="block">Search</span
          ><span class="relative block"
            ><Search
              class="pointer-events-none absolute top-3 left-3 size-4"
              aria-hidden="true" /><Input
              v-model="query"
              aria-label="Search"
              placeholder="Search issue titles"
              class="h-10 pl-9 text-foreground" /></span
        ></label>
        <label class="min-w-0 space-y-2 text-xs font-medium text-muted-foreground"
          ><span class="block">Status</span
          ><select
            v-model="status"
            aria-label="Status"
            class="workspace-select"
            :class="fieldClass"
          >
            <option value="">All statuses</option>
            <option value="unresolved">Unresolved</option>
            <option value="resolved">Resolved</option>
          </select></label
        >
        <label class="min-w-0 space-y-2 text-xs font-medium text-muted-foreground"
          ><span class="block">Environment</span
          ><Input
            v-model="environment"
            aria-label="Environment"
            placeholder="e.g. production"
            class="h-10 text-foreground"
        /></label>
        <label class="min-w-0 space-y-2 text-xs font-medium text-muted-foreground"
          ><span class="block">From</span
          ><input v-model="from" aria-label="From" type="datetime-local" :class="fieldClass"
        /></label>
        <label class="min-w-0 space-y-2 text-xs font-medium text-muted-foreground"
          ><span class="block">To</span
          ><input v-model="to" aria-label="To" type="datetime-local" :class="fieldClass"
        /></label>
        <Button type="submit" :disabled="loading" class="h-10 w-full gap-2"
          ><LoaderCircle v-if="loading" class="size-4 animate-spin" aria-hidden="true" /><Search
            v-else
            class="size-4"
            aria-hidden="true"
          />Apply filters</Button
        >
      </form>
    </section>

    <section
      class="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm"
      aria-label="Issue results"
    >
      <header class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-6">
        <div class="flex items-center gap-2.5">
          <Bug class="size-4 text-muted-foreground" aria-hidden="true" />
          <h3 class="text-sm font-semibold">Issues</h3>
          <span
            class="rounded-full border bg-muted/50 px-2 py-0.5 text-xs tabular-nums text-muted-foreground"
            >{{ total }} issues</span
          >
        </div>
        <span class="flex items-center gap-1.5 text-xs text-muted-foreground"
          ><CalendarDays class="size-3.5" aria-hidden="true" />Last seen, newest first</span
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
        <LoaderCircle class="size-6 animate-spin" aria-hidden="true" />Loading issues…
      </div>
      <div
        v-else-if="!records.length"
        class="flex min-h-80 flex-col items-center justify-center px-6 py-14 text-center"
      >
        <div class="mb-5 grid size-16 place-items-center rounded-2xl border bg-muted/30">
          <Bug class="size-7 text-muted-foreground" :stroke-width="1.5" aria-hidden="true" />
        </div>
        <h4 class="text-base font-semibold">No issues found</h4>
        <p class="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
          No results match these filters. Try a different project, environment or time range.
        </p>
        <p class="mt-5 text-xs text-muted-foreground">
          Issues appear here when your projects report errors.
        </p>
      </div>
      <div v-else class="min-w-0 overflow-x-auto">
        <table class="app-table min-w-[960px]">
          <thead>
            <tr>
              <th>Project</th>
              <th>Issue</th>
              <th>Environment</th>
              <th>Status</th>
              <th class="!text-right">Events</th>
              <th>Last seen</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="record in records"
              :key="record.id"
              class="transition-colors hover:bg-muted/20"
            >
              <td class="max-w-40 break-words font-medium">{{ projectName(record) }}</td>
              <td class="max-w-md">
                <p class="line-clamp-2 break-words font-medium" :title="record.title">
                  {{ record.title }}
                </p>
              </td>
              <td>
                <span
                  class="inline-flex max-w-36 break-all rounded-md border bg-muted/30 px-2 py-1 text-xs text-muted-foreground"
                  >{{ record.environment || '—' }}</span
                >
              </td>
              <td>
                <span
                  class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1 text-xs font-medium"
                  :class="
                    record.status === 'resolved'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : record.status === 'unresolved'
                        ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
                        : 'bg-muted text-muted-foreground'
                  "
                  ><Check
                    v-if="record.status === 'resolved'"
                    class="size-3"
                    aria-hidden="true"
                  /><Bug v-else class="size-3" aria-hidden="true" />{{
                    record.status === 'resolved'
                      ? 'Resolved'
                      : record.status === 'unresolved'
                        ? 'Unresolved'
                        : (record.status ?? '—')
                  }}</span
                >
              </td>
              <td class="text-right tabular-nums">
                {{ record.eventCount?.toLocaleString() ?? '—' }}
              </td>
              <td class="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                <time :datetime="record.lastSeenAt">{{ time(record.lastSeenAt) }}</time>
              </td>
              <td>
                <Button v-if="detail(record)" as-child variant="outline" size="sm"
                  ><RouterLink :to="detail(record)!"
                    >View issue<ArrowUpRight class="size-3.5" aria-hidden="true" /></RouterLink
                ></Button>
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
          unit="issues"
          label="Issue pagination"
          @change="emit('pageChange', $event)"
        />
      </footer>
    </section>
  </section>
</template>

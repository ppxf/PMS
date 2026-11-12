<script setup lang="ts">
import {
  Plug,
  Filter,
  Search,
  LoaderCircle,
  FolderKanban,
  Bug,
  Logs,
  Workflow,
  ChartNoAxesCombined,
  Flame,
  Gauge,
  ArrowUpRight,
  Clock,
} from '@lucide/vue'
import type { RouteLocationRaw } from 'vue-router'
import { Button } from '@/components/ui/button'
import TablePagination from '@/components/ui/pagination/TablePagination.vue'

interface Signal {
  type: string
  enabled: boolean
  lastSeenAt: string | null
  status: string
}
interface IngestionRecord {
  id: string
  projectId?: string
  projectName?: string
  projectSlug?: string
  groupSlug?: string
  name?: string
  groupName?: string
  signals?: Signal[]
}
const props = defineProps<{
  projects: { id: string; name: string; groupName?: string }[]
  groups: { id: string; name: string }[]
  records: IngestionRecord[]
  total: number
  page: number
  loading: boolean
  error: string
  detail: (record: IngestionRecord) => RouteLocationRaw | undefined
}>()
const projectId = defineModel<string>('projectId', { required: true })
const groupId = defineModel<string>('groupId', { required: true })
const emit = defineEmits<{ apply: []; retry: []; pageChange: [page: number] }>()
const fieldClass =
  'h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:opacity-50'
const signalTypes = {
  issues: { label: 'Errors', icon: Bug },
  logs: { label: 'Logs', icon: Logs },
  traces: { label: 'Traces', icon: Workflow },
  metrics: { label: 'Metrics', icon: ChartNoAxesCombined },
  profiles: { label: 'Profiles', icon: Flame },
  'web-vitals': { label: 'Web Vitals', icon: Gauge },
}
function signalType(type: string) {
  return signalTypes[type as keyof typeof signalTypes] ?? { label: type, icon: Plug }
}
function stateLabel(status: string) {
  return (
    (
      {
        active: 'Active in last 24 hours',
        waiting: 'Waiting for data',
        stale: 'No activity in last 24 hours',
        disabled: 'Disabled',
      } as Record<string, string>
    )[status] ?? status
  )
}
function stateClass(status: string) {
  if (status === 'active')
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
  if (status === 'stale')
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
  return 'border-border bg-muted/50 text-muted-foreground'
}
function projectName(record: IngestionRecord) {
  return (
    record.projectName ??
    record.name ??
    props.projects.find((project) => project.id === record.id)?.name ??
    'Project'
  )
}
function groupName(record: IngestionRecord) {
  return record.groupName ?? props.projects.find((project) => project.id === record.id)?.groupName
}
function time(value: string | null) {
  if (!value) return 'No data received'
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
        <Plug class="size-6 text-primary" aria-hidden="true" />
      </div>
      <div class="min-w-0">
        <h2 class="page-title">Ingestion status</h2>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Check data collection activity in the last 24 hours for each project.
        </p>
      </div>
    </header>

    <section
      class="overflow-hidden rounded-xl border bg-card shadow-sm"
      aria-label="Ingestion filters"
    >
      <div class="flex items-center gap-2.5 border-b bg-muted/20 px-5 py-4 sm:px-6">
        <Filter class="size-4 text-muted-foreground" aria-hidden="true" />
        <h3 class="text-sm font-semibold">Filter projects</h3>
        <span class="ml-auto hidden text-xs text-muted-foreground sm:block"
          >Across projects you can access</span
        >
      </div>
      <form
        data-testid="filters"
        class="grid min-w-0 grid-cols-1 items-end gap-4 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
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
        <Button
          type="submit"
          :disabled="loading"
          class="h-10 w-full gap-2 sm:col-span-2 xl:col-span-1"
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
      aria-label="Project ingestion status"
    >
      <header class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-6">
        <div class="flex items-center gap-2.5">
          <Plug class="size-4 text-muted-foreground" aria-hidden="true" />
          <h3 class="text-sm font-semibold">Data connections</h3>
          <span
            class="rounded-full border bg-muted/50 px-2 py-0.5 text-xs tabular-nums text-muted-foreground"
            >{{ total }} projects</span
          >
        </div>
        <span class="flex items-center gap-1.5 text-xs text-muted-foreground"
          ><Clock class="size-3.5" aria-hidden="true" />Times shown in your local timezone</span
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
        <LoaderCircle class="size-6 animate-spin" aria-hidden="true" />Loading ingestion status…
      </div>
      <div
        v-else-if="!records.length"
        class="flex min-h-80 flex-col items-center justify-center px-6 py-14 text-center"
      >
        <div class="mb-5 grid size-16 place-items-center rounded-2xl border bg-muted/30">
          <Plug class="size-7 text-muted-foreground" :stroke-width="1.5" aria-hidden="true" />
        </div>
        <h4 class="text-base font-semibold">No projects found</h4>
        <p class="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
          No results match these filters. Try a different project or group.
        </p>
      </div>
      <div v-else class="divide-y">
        <article v-for="record in records" :key="record.id" class="min-w-0 p-5 sm:p-6">
          <header class="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div class="flex min-w-0 items-start gap-3">
              <span class="grid size-10 shrink-0 place-items-center rounded-lg border bg-muted/30"
                ><FolderKanban class="size-4.5 text-muted-foreground" aria-hidden="true"
              /></span>
              <div class="min-w-0">
                <h4 class="break-words text-base font-semibold">{{ projectName(record) }}</h4>
                <p v-if="groupName(record)" class="mt-1 break-words text-xs text-muted-foreground">
                  {{ groupName(record) }}
                </p>
              </div>
            </div>
            <Button v-if="detail(record)" as-child variant="outline" size="sm"
              ><RouterLink :to="detail(record)!"
                >Open project details<ArrowUpRight
                  class="size-3.5"
                  aria-hidden="true" /></RouterLink
            ></Button>
          </header>
          <div
            v-if="record.signals?.length"
            class="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3"
          >
            <section
              v-for="signal in record.signals"
              :key="signal.type"
              class="min-w-0 rounded-lg border bg-muted/10 p-4"
              :aria-label="`${signalType(signal.type).label} ingestion`"
            >
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                  <component
                    :is="signalType(signal.type).icon"
                    class="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <h5 class="text-sm font-medium">{{ signalType(signal.type).label }}</h5>
                </div>
                <span
                  class="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium"
                  :class="stateClass(signal.status)"
                  ><span class="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />{{
                    stateLabel(signal.status)
                  }}</span
                >
              </div>
              <div class="mt-5 border-t pt-3">
                <p class="text-[11px] text-muted-foreground">Last received</p>
                <p
                  class="mt-1 break-words text-xs leading-5 tabular-nums"
                  :class="signal.lastSeenAt ? 'text-foreground' : 'text-muted-foreground'"
                >
                  <time v-if="signal.lastSeenAt" :datetime="signal.lastSeenAt">{{
                    time(signal.lastSeenAt)
                  }}</time
                  ><span v-else>No data received</span>
                </p>
              </div>
            </section>
          </div>
          <p
            v-else
            class="rounded-lg border border-dashed bg-muted/10 p-5 text-sm text-muted-foreground"
          >
            No signal details are available for this project.
          </p>
        </article>
      </div>
      <div
        class="flex items-start gap-2 border-t bg-muted/10 px-5 py-3 text-xs leading-5 text-muted-foreground sm:px-6"
      >
        <Clock class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <p>
          Activity reflects data received in the last 24 hours. A previously connected project may
          have no recent activity.
        </p>
      </div>
      <footer class="border-t bg-muted/10 px-5 py-4 sm:px-6">
        <TablePagination
          :page="page"
          :total="total"
          :page-size="20"
          :busy="loading"
          unit="projects"
          label="Ingestion pagination"
          @change="emit('pageChange', $event)"
        />
      </footer>
    </section>
  </section>
</template>

<script setup lang="ts">
import { formatDateTime } from '@/lib/date-time'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CircleCheck,
  CircleAlert,
  CodeXml,
  FolderKanban,
  RefreshCw,
  Search,
  ShieldCheck,
  Zap,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ErrorTrend from '../components/ErrorTrend.vue'
import { getDashboard, type DashboardOverview, type DashboardProject } from '../api/dashboard.api'

const data = ref<DashboardOverview | null>(null)
const loading = ref(true)
const failed = ref(false)
const groupId = ref('all')
const range = ref<'24h' | '7d'>('24h')
const search = ref('')
const chartProject = ref('all')
const chartSeries = computed(() => {
  const selected = data.value?.projects.find((p) => p.id === chartProject.value)
  return (
    data.value?.series.map((point, index) => ({
      ...point,
      count: selected ? (selected.series?.[index] ?? 0) : point.count,
    })) ?? []
  )
})
const chartTotal = computed(() => chartSeries.value.reduce((sum, point) => sum + point.count, 0))
watch(groupId, () => {
  chartProject.value = 'all'
})
let generation = 0
async function load() {
  const request = ++generation
  loading.value = true
  failed.value = false
  try {
    const result = await getDashboard({
      range: range.value,
      groupId: groupId.value === 'all' ? undefined : groupId.value,
    })
    if (request === generation) data.value = result
  } catch {
    if (request === generation) failed.value = true
  } finally {
    if (request === generation) loading.value = false
  }
}
watch([range, groupId], load, { immediate: true })
onBeforeUnmount(() => {
  generation++
})
const projects = computed(
  () =>
    data.value?.projects.filter((p) =>
      `${p.name} ${p.groupName}`.toLowerCase().includes(search.value.trim().toLowerCase()),
    ) ?? [],
)
const unreadable = computed(() => data.value?.projects.some((p) => p.unresolved === null))
const waiting = computed(() => data.value?.projects.filter((p) => !p.lastSeenAt) ?? [])
const setupProject = computed(() => waiting.value.find((p) => p.role === 'owner'))
const period = computed(() => (range.value === '24h' ? 'Last 24 hours' : 'Last 7 days'))
const stats = computed(() => {
  const t = data.value!.totals
  return [
    {
      label: 'Previously connected projects',
      value: `${t.connected}`,
      suffix: `/ ${t.projects}`,
      hint: `${t.projects - t.connected} waiting for SDK`,
      icon: FolderKanban,
      tone: '',
    },
    {
      label: 'Unresolved issues',
      value: t.unresolved.toLocaleString(),
      hint: 'Current · active issues',
      icon: CircleAlert,
      tone: t.unresolved ? 'text-amber-600 dark:text-amber-400' : '',
    },
    {
      label: 'Error events',
      value: t.events.toLocaleString(),
      hint: period.value,
      icon: Activity,
      tone: t.events ? 'text-rose-600 dark:text-rose-400' : '',
    },
    {
      label: 'New issues',
      value: t.newIssues.toLocaleString(),
      hint: period.value,
      icon: Zap,
      tone: '',
    },
  ]
})
function destination(p: DashboardProject, name: string) {
  return { name, params: { groupSlug: p.groupId, projectSlug: p.id } }
}
function can(p: DashboardProject, module: string) {
  return p.permissions.includes(`project:${module}:read`)
}
function projectFor(id: string) {
  return data.value!.projects.find((p) => p.id === id)!
}
function relative(value: string | null) {
  if (!value) return 'Never received'
  const minutes = Math.max(0, Math.floor((Date.parse(data.value!.end) - Date.parse(value)) / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`
  return `${Math.floor(minutes / 1440)}d ago`
}
function connection(p: DashboardProject) {
  if (!p.lastSeenAt) return 'Waiting for SDK'
  return Date.parse(p.lastSeenAt) < Date.parse(data.value!.end) - 86400000
    ? 'No activity in last 24 hours'
    : 'Active in last 24 hours'
}
</script>

<template>
  <section class="mx-auto max-w-[1600px] space-y-6" :aria-busy="loading">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Workspace overview
        </p>
        <h2 class="page-title">Monitoring overview</h2>
        <p class="mt-2 text-sm text-muted-foreground">
          A clear view of your projects. A faster path to what needs attention.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2 pt-1">
        <select v-model="groupId" aria-label="Group" class="dashboard-select" :disabled="loading">
          <option value="all">All groups</option>
          <option v-for="group in data?.groups" :key="group.id" :value="group.id">
            {{ group.name }}
          </option>
        </select>
        <select
          v-model="range"
          aria-label="Time range"
          class="dashboard-select"
          :disabled="loading"
        >
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
        </select>
        <Button
          variant="outline"
          size="icon"
          aria-label="Refresh dashboard"
          :disabled="loading"
          @click="load"
          ><RefreshCw class="size-4" :class="{ 'animate-spin': loading }"
        /></Button>
      </div>
    </div>

    <div
      v-if="failed"
      role="alert"
      class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-5"
    >
      <div>
        <p class="font-medium">Unable to load monitoring data</p>
        <p class="mt-1 text-sm text-muted-foreground">
          Please try again. Your monitoring data has not been changed.
        </p>
      </div>
      <Button data-testid="retry" variant="outline" @click="load">Try again</Button>
    </div>
    <div v-else-if="loading" class="space-y-6" role="status" aria-label="Loading dashboard">
      <div class="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div v-for="i in 4" :key="i" class="h-36 animate-pulse rounded-xl border bg-muted/40" />
      </div>
      <div class="h-80 animate-pulse rounded-xl border bg-muted/30" />
      <span class="sr-only">Loading monitoring data…</span>
    </div>
    <template v-else-if="data">
      <div data-testid="dashboard-stats" class="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div v-for="stat in stats" :key="stat.label" class="dashboard-panel p-5">
          <div class="flex items-center justify-between gap-3">
            <span class="text-sm text-muted-foreground">{{ stat.label }}</span
            ><component :is="stat.icon" class="size-4 text-muted-foreground" />
          </div>
          <div class="mt-4 flex items-baseline gap-2">
            <span class="text-3xl font-semibold tracking-tight tabular-nums" :class="stat.tone">{{
              stat.value
            }}</span
            ><span v-if="stat.suffix" class="text-lg text-muted-foreground">{{ stat.suffix }}</span>
          </div>
          <p class="mt-2 text-xs text-muted-foreground">{{ stat.hint }}</p>
        </div>
      </div>
      <p v-if="unreadable" class="text-xs text-muted-foreground">
        Error statistics include only projects you have permission to read. Restricted values appear
        as —.
      </p>

      <div
        v-if="!data.projects.length"
        class="dashboard-panel flex flex-col items-center px-6 py-14 text-center"
      >
        <div class="mb-5 flex size-12 items-center justify-center rounded-xl border bg-muted/50">
          <FolderKanban class="size-6 text-muted-foreground" />
        </div>
        <h3 class="text-lg font-semibold">Your monitoring starts here</h3>
        <p class="mt-2 max-w-md text-sm text-muted-foreground">
          Create a project, connect the SDK, and bring errors and performance into one place.
        </p>
        <Button as-child class="mt-6"
          ><RouterLink :to="{ name: 'groups' }"
            >Manage groups and projects <ArrowRight class="size-4" /></RouterLink
        ></Button>
      </div>
      <template v-else>
        <div class="grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,1fr)]">
          <div class="dashboard-panel min-w-0 p-5 sm:p-6">
            <div class="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 class="font-semibold">Error activity</h3>
                <p class="mt-1 text-xs text-muted-foreground">
                  Error events across accessible projects
                </p>
              </div>
              <select v-model="chartProject" aria-label="Chart project" class="dashboard-select">
                <option value="all">All projects</option>
                <option
                  v-for="project in data.projects.filter((p) => p.events !== null)"
                  :key="project.id"
                  :value="project.id"
                >
                  {{ project.name }}
                </option>
              </select>
            </div>
            <ErrorTrend :series="chartSeries" :end="data.end" :range="data.range" />
            <div class="mt-2 flex items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
              <ShieldCheck class="size-3.5 shrink-0" /><span>{{
                chartTotal
                  ? `${chartTotal.toLocaleString()} error events received in this period.`
                  : 'No error events received in this period.'
              }}</span>
            </div>
          </div>
          <div class="dashboard-panel flex min-w-0 flex-col">
            <div class="flex items-center justify-between gap-3 px-5 pt-6 sm:px-6">
              <div>
                <h3 class="font-semibold">Needs attention</h3>
                <p class="mt-1 text-xs text-muted-foreground">New and reopened issues first</p>
              </div>
              <span class="rounded-md bg-muted px-2 py-1 text-xs tabular-nums">{{
                data.issues.length
              }}</span>
            </div>
            <div
              v-if="!data.issues.length"
              class="flex min-h-64 flex-1 flex-col items-center justify-center px-6 py-8 text-center"
            >
              <div class="mb-4 rounded-full bg-muted/60 p-3">
                <CircleCheck class="size-6 text-muted-foreground" />
              </div>
              <p class="text-sm font-medium">Nothing needs attention</p>
              <p class="mt-2 max-w-56 text-xs leading-relaxed text-muted-foreground">
                No active unresolved issues were seen in this period.
              </p>
            </div>
            <div v-else class="mt-4 divide-y px-5 pb-2 sm:px-6">
              <RouterLink
                v-for="issue in data.issues"
                :key="issue.id"
                :to="{
                  ...destination(projectFor(issue.projectId), 'project-issue-detail'),
                  params: {
                    ...destination(projectFor(issue.projectId), 'project-issue-detail').params,
                    issueId: issue.id,
                  },
                }"
                class="group flex items-start gap-3 py-3.5"
              >
                <span class="mt-1.5 size-1.5 shrink-0 rounded-full bg-rose-500" />
                <div class="min-w-0 flex-1">
                  <p
                    class="truncate text-sm font-medium group-hover:underline"
                    :title="issue.title"
                  >
                    {{ issue.title }}
                  </p>
                  <p class="mt-1.5 truncate text-xs text-muted-foreground">
                    {{ projectFor(issue.projectId).name }} · {{ relative(issue.lastSeenAt) }}
                  </p>
                  <p class="mt-1 text-[11px] text-muted-foreground">
                    {{ issue.eventCount.toLocaleString() }} lifetime events
                    <span
                      v-if="issue.reopenedAt && issue.reopenedAt >= data.start"
                      class="ml-1 text-amber-600"
                      >· Reopened</span
                    ><span v-else-if="issue.firstSeenAt >= data.start" class="ml-1 text-rose-600"
                      >· New</span
                    >
                  </p>
                </div>
                <ArrowUpRight
                  class="mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                />
              </RouterLink>
            </div>
          </div>
        </div>

        <div
          v-if="setupProject"
          class="flex flex-wrap items-center gap-4 rounded-xl border border-dashed bg-muted/20 px-5 py-5 sm:px-6"
        >
          <div
            class="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background"
          >
            <CodeXml class="size-5 text-muted-foreground" />
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="text-sm font-medium">
              Connect your
              {{ waiting.length === 1 ? 'next project' : `${waiting.length} remaining projects` }}
            </h3>
            <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
              Install the SDK → Send your first event → Explore your monitoring data.
            </p>
          </div>
          <Button as-child variant="outline" size="sm"
            ><RouterLink :to="destination(setupProject, 'project-setup')"
              >Set up {{ setupProject.name }} <ArrowRight class="size-3.5" /></RouterLink
          ></Button>
        </div>

        <div class="dashboard-panel overflow-hidden">
          <div class="flex flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-6">
            <div>
              <h3 class="font-semibold">
                Project overview
                <span class="ml-2 text-xs font-normal text-muted-foreground">{{
                  data.projects.length
                }}</span>
              </h3>
              <p class="mt-1 text-xs text-muted-foreground">Prioritized by unresolved issues</p>
            </div>
            <div class="relative w-full sm:w-60">
              <Search
                class="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground"
              /><Input
                v-model="search"
                aria-label="Search projects"
                placeholder="Search projects…"
                class="h-9 pl-9"
              />
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[760px] text-left text-sm">
              <thead class="border-y bg-muted/25 text-xs text-muted-foreground">
                <tr>
                  <th class="px-6 py-3 font-medium">Project</th>
                  <th class="px-4 py-3 font-medium">Data connection</th>
                  <th class="px-4 py-3 text-right font-medium">Unresolved</th>
                  <th class="px-4 py-3 text-right font-medium">Error events</th>
                  <th class="px-4 py-3 font-medium">Last received</th>
                  <th class="px-6 py-3 text-right font-medium">Explore</th>
                </tr>
              </thead>
              <tbody class="divide-y">
                <tr
                  v-for="project in projects"
                  :key="project.id"
                  :data-project="project.id"
                  class="transition-colors hover:bg-muted/20"
                >
                  <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                      <span
                        class="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/30 text-xs font-semibold uppercase"
                        >{{ project.platform }}</span
                      >
                      <div>
                        <p class="max-w-56 truncate font-medium" :title="project.name">
                          {{ project.name }}
                        </p>
                        <p class="mt-1 text-xs text-muted-foreground">{{ project.groupName }}</p>
                      </div>
                    </div>
                  </td>
                  <td class="px-4 py-4">
                    <span class="inline-flex items-center gap-2 whitespace-nowrap text-xs"
                      ><span
                        class="size-1.5 rounded-full"
                        :class="
                          connection(project) === 'Active in last 24 hours'
                            ? 'bg-emerald-500'
                            : connection(project) === 'Waiting for SDK'
                              ? 'bg-amber-500'
                              : 'bg-muted-foreground'
                        "
                      />{{ connection(project) }}</span
                    >
                  </td>
                  <td class="px-4 py-4 text-right tabular-nums">
                    <RouterLink
                      v-if="project.unresolved !== null && can(project, 'issues')"
                      :to="destination(project, 'project-issues')"
                      class="rounded-md px-2 py-1 hover:underline"
                      :class="
                        project.unresolved
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                          : 'text-muted-foreground'
                      "
                      >{{ project.unresolved.toLocaleString() }}</RouterLink
                    ><span
                      v-else
                      title="Error read permission required"
                      class="text-muted-foreground"
                      >—</span
                    >
                  </td>
                  <td class="px-4 py-4 text-right tabular-nums">
                    {{ project.events?.toLocaleString() ?? '—' }}
                  </td>
                  <td
                    class="whitespace-nowrap px-4 py-4 text-xs text-muted-foreground"
                    :title="project.lastSeenAt ? formatDateTime(project.lastSeenAt) : ''"
                  >
                    {{ relative(project.lastSeenAt) }}
                  </td>
                  <td class="px-6 py-4">
                    <div class="flex justify-end gap-3 text-xs">
                      <RouterLink
                        v-if="can(project, 'issues')"
                        :to="destination(project, 'project-issues')"
                        class="text-muted-foreground hover:text-foreground hover:underline"
                        >Errors</RouterLink
                      ><RouterLink
                        v-if="can(project, 'traces')"
                        :to="destination(project, 'project-traces')"
                        class="text-muted-foreground hover:text-foreground hover:underline"
                        >Traces</RouterLink
                      ><RouterLink
                        v-if="can(project, 'web-vitals')"
                        :to="destination(project, 'project-web-vitals')"
                        class="whitespace-nowrap text-muted-foreground hover:text-foreground hover:underline"
                        >Web Vitals</RouterLink
                      ><RouterLink
                        v-if="!project.lastSeenAt && project.role === 'owner'"
                        :to="destination(project, 'project-setup')"
                        class="inline-flex items-center gap-1 font-medium"
                        >Set up <ArrowUpRight class="size-3"
                      /></RouterLink>
                    </div>
                  </td>
                </tr>
                <tr v-if="!projects.length">
                  <td colspan="6" class="px-6 py-12 text-center text-sm text-muted-foreground">
                    No projects match “{{ search }}”.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div
            class="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-3 text-xs text-muted-foreground"
          >
            <span>Error events: {{ period.toLowerCase() }} · Unresolved: current total</span
            ><RouterLink
              :to="{ name: 'groups' }"
              class="inline-flex items-center gap-1.5 hover:text-foreground"
              >Manage groups and projects <ArrowUpRight class="size-3"
            /></RouterLink>
          </div>
        </div>
      </template>
      <div class="flex items-center justify-between gap-4 text-[11px] text-muted-foreground">
        <span class="inline-flex items-center gap-1.5"
          ><Activity class="size-3" />PMS monitoring</span
        ><span
          >Updated
          {{ new Date(data.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }} ·
          Refresh for latest data</span
        >
      </div>
    </template>
  </section>
</template>

<style scoped>
.dashboard-panel {
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--card);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.025);
}
.dashboard-select {
  height: 2.25rem;
  max-width: 12rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--background);
  padding: 0 1.75rem 0 0.75rem;
  font-size: 0.75rem;
  color: var(--foreground);
}
.dashboard-select:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
.dashboard-select:disabled {
  opacity: 0.55;
}
</style>

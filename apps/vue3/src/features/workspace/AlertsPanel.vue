<script setup lang="ts">
import {
  Bell,
  Filter,
  Search,
  Settings,
  Plus,
  Pencil,
  Check,
  LoaderCircle,
  CalendarDays,
  CircleCheck,
} from '@lucide/vue'
import type { RouteLocationRaw } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import TablePagination from '@/components/ui/pagination/TablePagination.vue'

interface Project {
  id: string
  name: string
  slug?: string
  groupSlug?: string
}
interface AlertRecord {
  id: string
  projectId?: string
  projectName?: string
  projectSlug?: string
  groupSlug?: string
  title?: string
  kind?: string
  issueId?: string
  status?: string
  acknowledgedAt?: string
  createdAt?: string
}
interface RuleDraft {
  projectId: string
  name: string
  kind: string
  threshold: number
  windowMinutes: number
  enabled: boolean
}
interface Rule extends RuleDraft {
  id: string
}
const props = defineProps<{
  projects: Project[]
  ownerProjects: Project[]
  groups: { id: string; name: string }[]
  records: AlertRecord[]
  rules: Rule[]
  total: number
  page: number
  ruleTotal: number
  rulePage: number
  loading: boolean
  saving: boolean
  error: string
  ruleId: string
  detail: (record: AlertRecord) => RouteLocationRaw | undefined
}>()
const projectId = defineModel<string>('projectId', { required: true })
const groupId = defineModel<string>('groupId', { required: true })
const from = defineModel<string>('from', { required: true })
const to = defineModel<string>('to', { required: true })
const editing = defineModel<boolean>('editing', { required: true })
const rule = defineModel<RuleDraft>('rule', { required: true })
const emit = defineEmits<{
  apply: []
  retry: []
  pageChange: [page: number]
  rulePageChange: [page: number]
  editRule: [rule?: Rule]
  saveRule: []
  acknowledge: [id: string]
}>()
const fieldClass =
  'h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:opacity-50'
function triggerName(kind?: string) {
  return (
    (
      {
        new_issue: 'New issue',
        reopened_issue: 'Reopened issue',
        error_threshold: 'Error threshold',
      } as Record<string, string>
    )[kind ?? ''] ??
    kind ??
    'Alert'
  )
}
function projectName(id?: string) {
  return props.projects.find((project) => project.id === id)?.name ?? 'Project'
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
        <Bell class="size-6 text-primary" aria-hidden="true" />
      </div>
      <div class="min-w-0">
        <h2 class="page-title">Alerts</h2>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Monitor triggered alerts and manage rules across your projects.
        </p>
      </div>
    </header>

    <section class="overflow-hidden rounded-xl border bg-card shadow-sm" aria-label="Alert filters">
      <div class="flex items-center gap-2.5 border-b bg-muted/20 px-5 py-4 sm:px-6">
        <Filter class="size-4 text-muted-foreground" aria-hidden="true" />
        <h3 class="text-sm font-semibold">Filter alerts</h3>
        <span class="ml-auto hidden text-xs text-muted-foreground sm:block"
          >Across projects you can access</span
        >
      </div>
      <form
        data-testid="filters"
        class="grid min-w-0 grid-cols-1 items-end gap-4 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-[1.3fr_1fr_1.1fr_1.1fr_auto]"
        @submit.prevent="emit('apply')"
      >
        <label class="min-w-0 space-y-2 text-xs font-medium text-muted-foreground"
          ><span class="block">Project</span
          ><select
            class="workspace-select"
            v-model="projectId"
            aria-label="Project"
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
            class="workspace-select"
            v-model="groupId"
            aria-label="Group"
            :class="fieldClass"
          >
            <option value="">All groups</option>
            <option v-for="group in groups" :key="group.id" :value="group.id">
              {{ group.name }}
            </option>
          </select></label
        >
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
      aria-label="Alert history"
    >
      <header class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-6">
        <div class="flex items-center gap-2.5">
          <Bell class="size-4 text-muted-foreground" aria-hidden="true" />
          <h3 class="text-sm font-semibold">Alert history</h3>
          <span
            class="rounded-full border bg-muted/50 px-2 py-0.5 text-xs tabular-nums text-muted-foreground"
            >{{ total }} alerts</span
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
        class="flex min-h-56 flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
      >
        <LoaderCircle class="size-6 animate-spin" aria-hidden="true" />Loading alerts…
      </div>
      <div
        v-else-if="!records.length"
        class="flex min-h-60 flex-col items-center justify-center px-6 py-10 text-center"
      >
        <div class="mb-4 grid size-14 place-items-center rounded-2xl border bg-muted/30">
          <Bell class="size-6 text-muted-foreground" :stroke-width="1.5" aria-hidden="true" />
        </div>
        <h4 class="text-base font-semibold">No alerts found</h4>
        <p class="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
          No results match these filters. Triggered alerts will appear here when a rule matches.
        </p>
      </div>
      <div v-else class="min-w-0 overflow-x-auto">
        <table class="app-table min-w-[800px]">
          <thead>
            <tr>
              <th>Project</th>
              <th>Alert</th>
              <th>Status</th>
              <th>Triggered</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="record in records"
              :key="record.id"
              class="transition-colors hover:bg-muted/20"
            >
              <td class="max-w-48 break-words font-medium">
                {{ record.projectName ?? projectName(record.projectId) }}
              </td>
              <td class="max-w-md">
                <p class="break-words font-medium">{{ record.title }}</p>
                <p class="mt-1 text-xs text-muted-foreground">{{ triggerName(record.kind) }}</p>
              </td>
              <td>
                <span
                  class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1 text-xs font-medium"
                  :class="
                    record.status === 'recovered'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
                  "
                  ><CircleCheck
                    v-if="record.status === 'recovered'"
                    class="size-3"
                    aria-hidden="true"
                  /><Bell v-else class="size-3" aria-hidden="true" />{{
                    record.status === 'recovered'
                      ? 'Recovered'
                      : record.status === 'open'
                        ? 'Open'
                        : record.status
                  }}</span
                >
                <p
                  v-if="record.acknowledgedAt"
                  class="mt-2 flex items-center gap-1 text-xs text-muted-foreground"
                >
                  <Check class="size-3" aria-hidden="true" />Acknowledged
                </p>
              </td>
              <td class="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                <time :datetime="record.createdAt">{{ time(record.createdAt) }}</time>
              </td>
              <td>
                <div class="flex flex-wrap items-center gap-2">
                  <Button v-if="detail(record)" as-child variant="ghost" size="sm"
                    ><RouterLink :to="detail(record)!">Open project details</RouterLink></Button
                  ><Button
                    v-if="!record.acknowledgedAt"
                    type="button"
                    variant="outline"
                    size="sm"
                    :disabled="saving"
                    @click="emit('acknowledge', record.id)"
                    ><Check class="size-3.5" aria-hidden="true" />Acknowledge</Button
                  >
                </div>
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
          unit="alerts"
          label="Alert pagination"
          @change="emit('pageChange', $event)"
        />
      </footer>
    </section>

    <section
      class="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm"
      aria-label="Alert rules"
    >
      <header class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-6">
        <div class="flex items-center gap-2.5">
          <Settings class="size-4 text-muted-foreground" aria-hidden="true" />
          <h3 class="text-sm font-semibold">Alert rules</h3>
          <span
            class="rounded-full border bg-muted/50 px-2 py-0.5 text-xs tabular-nums text-muted-foreground"
            >{{ ruleTotal }} rules</span
          >
        </div>
        <Button
          v-if="ownerProjects.length"
          type="button"
          size="sm"
          :disabled="saving"
          @click="emit('editRule')"
          ><Plus class="size-4" aria-hidden="true" />Create rule</Button
        >
      </header>
      <div
        v-if="!rules.length && !loading"
        class="flex min-h-44 flex-col items-center justify-center px-6 py-8 text-center"
      >
        <Settings
          class="mb-3 size-7 text-muted-foreground"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        <h4 class="text-sm font-semibold">No alert rules yet</h4>
        <p class="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {{
            ownerProjects.length
              ? 'Create a rule to watch for new issues, reopened issues or error thresholds.'
              : 'Project owners can create rules to monitor issues and error thresholds.'
          }}
        </p>
      </div>
      <div v-else-if="loading" class="p-6 text-sm text-muted-foreground">Loading rules…</div>
      <div v-else class="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-3">
        <article
          v-for="item in rules"
          :key="item.id"
          class="flex min-w-0 flex-col rounded-lg border p-4"
        >
          <div class="flex items-start justify-between gap-3">
            <h4 class="min-w-0 break-words text-sm font-semibold">{{ item.name }}</h4>
            <span
              class="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium"
              :class="
                item.enabled
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'bg-muted text-muted-foreground'
              "
              >{{ item.enabled ? 'Enabled' : 'Disabled' }}</span
            >
          </div>
          <p class="mt-1 break-words text-xs text-muted-foreground">
            {{ projectName(item.projectId) }}
          </p>
          <p class="mt-4 text-sm">{{ triggerName(item.kind) }}</p>
          <p v-if="item.kind === 'error_threshold'" class="mt-1 text-xs text-muted-foreground">
            {{ item.threshold }} errors / {{ item.windowMinutes }} minutes
          </p>
          <div class="mt-auto flex justify-end pt-4">
            <Button
              v-if="ownerProjects.some((project) => project.id === item.projectId)"
              type="button"
              variant="outline"
              size="sm"
              @click="emit('editRule', item)"
              ><Pencil class="size-3.5" aria-hidden="true" />Edit rule</Button
            >
          </div>
        </article>
      </div>
      <form
        v-if="editing"
        class="m-5 space-y-5 rounded-xl border bg-muted/20 p-5 sm:m-6 sm:p-6"
        @submit.prevent="emit('saveRule')"
      >
        <div>
          <h4 class="text-base font-semibold">{{ ruleId ? 'Edit rule' : 'Create rule' }}</h4>
          <p class="mt-1 text-sm text-muted-foreground">
            Choose a project and when an alert should be triggered.
          </p>
        </div>
        <div class="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <label class="min-w-0 space-y-2 text-xs font-medium text-muted-foreground"
            ><span class="block">Project</span
            ><select
              class="workspace-select"
              v-model="rule.projectId"
              aria-label="Rule project"
              required
              :disabled="!!ruleId"
              :class="fieldClass"
            >
              <option v-for="project in ownerProjects" :key="project.id" :value="project.id">
                {{ project.name }}
              </option>
            </select></label
          >
          <label class="min-w-0 space-y-2 text-xs font-medium text-muted-foreground"
            ><span class="block">Name</span
            ><Input
              v-model="rule.name"
              aria-label="Rule name"
              required
              maxlength="120"
              placeholder="e.g. Checkout errors"
              class="h-10"
          /></label>
          <label class="min-w-0 space-y-2 text-xs font-medium text-muted-foreground"
            ><span class="block">Trigger</span
            ><select
              class="workspace-select"
              v-model="rule.kind"
              aria-label="Rule trigger"
              :class="fieldClass"
            >
              <option value="new_issue">New issue</option>
              <option value="reopened_issue">Reopened issue</option>
              <option value="error_threshold">Error threshold</option>
            </select></label
          >
          <template v-if="rule.kind === 'error_threshold'"
            ><label class="min-w-0 space-y-2 text-xs font-medium text-muted-foreground"
              ><span class="block">Threshold</span
              ><Input
                v-model.number="rule.threshold"
                aria-label="Error threshold"
                type="number"
                min="1"
                required
                class="h-10" /></label
            ><label class="min-w-0 space-y-2 text-xs font-medium text-muted-foreground"
              ><span class="block">Window (minutes)</span
              ><Input
                v-model.number="rule.windowMinutes"
                aria-label="Window in minutes"
                type="number"
                min="1"
                max="1440"
                required
                class="h-10" /></label
          ></template>
        </div>
        <label class="flex items-start gap-3 rounded-lg border bg-background p-4"
          ><input
            v-model="rule.enabled"
            type="checkbox"
            class="mt-0.5 size-4 accent-primary"
          /><span
            ><span class="block text-sm font-medium">Enabled</span
            ><span class="mt-1 block text-xs leading-5 text-muted-foreground"
              >Evaluate this rule and generate matching alerts.</span
            ></span
          ></label
        >
        <div class="flex flex-wrap justify-end gap-3 border-t pt-4">
          <Button type="button" variant="outline" :disabled="saving" @click="editing = false"
            >Cancel</Button
          ><Button type="submit" :disabled="saving"
            ><LoaderCircle v-if="saving" class="size-4 animate-spin" aria-hidden="true" />Save
            rule</Button
          >
        </div>
      </form>
      <footer class="border-t bg-muted/10 px-5 py-4 sm:px-6">
        <TablePagination
          :page="rulePage"
          :total="ruleTotal"
          :page-size="20"
          :busy="loading"
          unit="rules"
          label="Rule pagination"
          previous-label="Previous rules"
          next-label="Next rules"
          @change="emit('rulePageChange', $event)"
        />
      </footer>
    </section>
  </section>
</template>

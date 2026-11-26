<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { translate } from '@/i18n'
import { formatDateTime } from '@/lib/date-time'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import EmptyState from '@/components/ui/empty-state/EmptyState.vue'
import TablePagination from '@/components/ui/pagination/TablePagination.vue'
import FormSelect from '@/components/ui/select/FormSelect.vue'
import { traceLogs, type TraceLogsResult } from '../api/logs.api'
import { LOG_LEVELS, type LogLevel } from '../model/logs'
import MetricAttributeTree from './MetricAttributeTree.vue'

const props = defineProps<{ group: string; project: string; traceId: string }>()
const result = ref<TraceLogsResult>()
const loading = ref(false),
  error = ref(''),
  search = ref(''),
  appliedSearch = ref('')
const level = ref('all'),
  page = ref(1),
  expanded = ref('')
const colors: Record<string, string> = {
  trace: '#64748b',
  debug: '#8b5cf6',
  info: '#2563eb',
  warn: '#d97706',
  error: '#dc2626',
  fatal: '#991b1b',
}
let generation = 0
async function load() {
  const current = ++generation
  loading.value = true
  error.value = ''
  result.value = undefined
  expanded.value = ''
  try {
    const response = await traceLogs(props.group, props.project, props.traceId, {
      page: page.value,
      pageSize: 20,
      ...(appliedSearch.value ? { search: appliedSearch.value } : {}),
      ...(level.value !== 'all' ? { levels: [level.value as LogLevel] } : {}),
    })
    if (current === generation) result.value = response
  } catch {
    if (current === generation) error.value = 'Unable to load related logs'
  } finally {
    if (current === generation) loading.value = false
  }
}
function applySearch() {
  appliedSearch.value = search.value.trim()
  page.value = 1
  void load()
}
function changePage(next: number) {
  page.value = next
  void load()
}
watch(level, () => {
  page.value = 1
  void load()
})
watch(
  [() => props.group, () => props.project, () => props.traceId],
  () => {
    search.value = ''
    appliedSearch.value = ''
    page.value = 1
    if (level.value !== 'all') level.value = 'all'
    else void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  generation++
})
</script>

<template>
  <section :aria-label="translate('Related logs')" class="space-y-4">
    <form class="flex flex-wrap items-center gap-3" @submit.prevent="applySearch">
      <Input
        v-model="search"
        :aria-label="translate('Search related logs')"
        :placeholder="translate('Search logs in this trace')"
        maxlength="256"
        class="min-w-60 flex-1"
      />
      <FormSelect
        v-model="level"
        :aria-label="translate('Log level')"
        :options="[
          { value: 'all', label: 'All levels' },
          ...LOG_LEVELS.map((value) => ({ value, label: value })),
        ]"
      />
      <Button type="submit" variant="outline" :disabled="loading">{{ translate('Search') }}</Button>
      <Button type="button" variant="outline" :disabled="loading" @click="load">{{
        translate('Refresh')
      }}</Button>
      <RouterLink
        class="text-sm text-cyan-700 underline"
        :to="{
          name: 'project-logs',
          params: { groupSlug: group, projectSlug: project },
          query: { traceId },
        }"
        >{{ translate('Open in Logs') }}</RouterLink
      >
    </form>
    <p v-if="loading" role="status" class="text-sm text-muted-foreground">
      {{ translate('Loading logs…') }}
    </p>
    <p v-if="error" role="alert">
      {{ translate(error) }}
      <Button variant="outline" @click="load">{{ translate('Retry') }}</Button>
    </p>
    <div class="table-surface">
      <table class="app-table">
        <thead>
          <tr>
            <th>{{ translate('Timestamp') }}</th>
            <th>{{ translate('Level') }}</th>
            <th>{{ translate('Message') }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="log in result?.items" :key="log.logId">
            <tr
              class="cursor-pointer hover:bg-muted/50"
              @click="expanded = expanded === log.logId ? '' : log.logId"
            >
              <td class="whitespace-nowrap p-3 tabular-nums">
                {{ formatDateTime(log.timestamp, { milliseconds: true }) }}
              </td>
              <td class="p-3" :style="{ color: colors[log.level] }">● {{ log.level }}</td>
              <td class="p-3">
                <button
                  type="button"
                  class="flex w-full cursor-pointer items-start gap-2 text-left"
                  :aria-expanded="expanded === log.logId"
                  :aria-label="translate(`View log ${log.message}`)"
                  @click.stop="expanded = expanded === log.logId ? '' : log.logId"
                >
                  <span aria-hidden="true">{{ expanded === log.logId ? '⌄' : '›' }}</span
                  ><span class="break-all">{{ log.message }}</span>
                </button>
              </td>
            </tr>
            <tr v-if="expanded === log.logId">
              <td colspan="3" class="bg-muted/20 p-4">
                <div class="space-y-3 rounded-lg border bg-card p-4">
                  <p class="whitespace-pre-wrap break-all border-b pb-3 font-mono text-xs">
                    {{ log.message }}
                  </p>
                  <dl class="grid gap-x-6 gap-y-2 font-mono text-xs md:grid-cols-2">
                    <div
                      v-for="(value, key) in {
                        logId: log.logId,
                        traceId: log.traceId,
                        spanId: log.spanId,
                        timestamp: formatDateTime(log.timestamp, { milliseconds: true }),
                        environment: log.environment,
                        release: log.release,
                      }"
                      :key="key"
                      class="flex min-w-0 gap-3 rounded bg-muted/40 p-2"
                    >
                      <dt class="text-muted-foreground">{{ key }}</dt>
                      <dd class="break-all">{{ value ?? '—' }}</dd>
                    </div>
                  </dl>
                  <MetricAttributeTree :entries="Object.entries(log.attributes)" />
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <EmptyState
        v-if="!loading && !error && result && !result.items.length"
        class="p-8"
        :title="translate('No matching related logs')"
      />
    </div>
    <TablePagination
      v-if="result"
      :page="result.page"
      :total="result.total"
      :page-size="result.pageSize"
      :busy="loading"
      unit="logs"
      :label="translate('Related logs pagination')"
      previous-label="Previous logs page"
      next-label="Next logs page"
      @change="changePage"
    />
  </section>
</template>

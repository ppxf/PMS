<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { http } from '@/services/http'
import AuditRecordsPanel from './AuditRecordsPanel.vue'
import AlertsPanel from './AlertsPanel.vue'
import IssuesPanel from './IssuesPanel.vue'
import IngestionPanel from './IngestionPanel.vue'

type Section = 'issues' | 'alerts' | 'ingestion' | 'audit'
interface Project {
  id: string
  name: string
  slug: string
  groupId: string
  groupName: string
  groupSlug: string
  role: string
  permissions: string[]
}
interface Row {
  id: string
  projectId?: string
  projectName?: string
  projectSlug?: string
  groupSlug?: string
  title?: string
  name?: string
  status?: string
  environment?: string
  eventCount?: number
  kind?: string
  acknowledgedAt?: string
  createdAt?: string
  lastSeenAt?: string
  actorName?: string
  action?: string
  result?: string
  objectName?: string
  summary?: Record<string, unknown>
  issueId?: string
  statusCode?: number
  objectType?: string
  objectId?: string
  requestId?: string
  signals?: { type: string; enabled: boolean; lastSeenAt: string | null; status: string }[]
}
interface Rule {
  id: string
  projectId: string
  name: string
  kind: string
  threshold: number
  windowMinutes: number
  enabled: boolean
}
const props = defineProps<{ section: Section }>()
const projects = ref<Project[]>([]),
  rows = ref<Row[]>([]),
  rules = ref<Rule[]>([])
const loading = ref(false),
  error = ref(''),
  total = ref(0),
  page = ref(1)
const projectId = ref(''),
  groupId = ref(''),
  q = ref(''),
  status = ref(''),
  environment = ref(''),
  from = ref(''),
  to = ref(''),
  action = ref(''),
  actor = ref('')
const editing = ref(false),
  saving = ref(false),
  ruleId = ref('')
const rule = ref({
  projectId: '',
  name: '',
  kind: 'new_issue',
  threshold: 10,
  windowMinutes: 5,
  enabled: true,
})
const rulePage = ref(1),
  ruleTotal = ref(0)
function changeRulePage(delta: number) {
  rulePage.value += delta
  void load()
}
let generation = 0
const allowedProjects = computed(() =>
  props.section === 'audit'
    ? projects.value.filter(
        (p) => p.role === 'owner' || p.permissions.includes('project:audit:read'),
      )
    : projects.value,
)
const ownerProjects = computed(() => projects.value.filter((p) => p.role === 'owner'))
const groups = computed(() => [
  ...new Map(
    allowedProjects.value.map((p) => [p.groupId, { id: p.groupId, name: p.groupName }]),
  ).values(),
])
async function load() {
  const version = ++generation
  loading.value = true
  error.value = ''
  try {
    const params: Record<string, unknown> = { page: page.value, pageSize: 20 }
    for (const [key, value] of Object.entries({
      projectId: projectId.value,
      groupId: groupId.value,
      from: from.value,
      to: to.value,
    }))
      if (value)
        params[key] = key === 'from' || key === 'to' ? new Date(value).toISOString() : value
    if (props.section === 'issues')
      Object.assign(params, {
        q: q.value || undefined,
        status: status.value || undefined,
        environment: environment.value || undefined,
      })
    if (props.section === 'audit') {
      delete params.groupId
      Object.assign(params, { action: action.value || undefined, actor: actor.value || undefined })
    }
    const result = await http.get<{ items: Row[]; total: number }>(
      props.section === 'audit' ? '/audit-records' : `/workspace/${props.section}`,
      { params },
    )
    if (version !== generation) return
    rows.value = result.items
    total.value = result.total
    if (props.section === 'alerts') {
      const result = await http.get<{ items: Rule[]; total: number }>('/workspace/alert-rules', {
        params: {
          projectId: projectId.value || undefined,
          groupId: groupId.value || undefined,
          page: rulePage.value,
          pageSize: 20,
        },
      })
      if (version === generation) {
        rules.value = result.items
        ruleTotal.value = result.total
      }
    }
  } catch (e) {
    if (version === generation) {
      rows.value = []
      error.value = e instanceof Error ? e.message : 'Unable to load workspace'
    }
  } finally {
    if (version === generation) loading.value = false
  }
}
async function initialize() {
  try {
    projects.value = await http.get<Project[]>('/workspace/projects')
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to load projects'
  }
}
function apply() {
  page.value = 1
  rulePage.value = 1
  void load()
}
function changePage(delta: number) {
  page.value += delta
  void load()
}
function editRule(value?: Rule) {
  ruleId.value = value?.id ?? ''
  rule.value = value
    ? {
        projectId: value.projectId,
        name: value.name,
        kind: value.kind,
        threshold: value.threshold,
        windowMinutes: value.windowMinutes,
        enabled: value.enabled,
      }
    : {
        projectId: ownerProjects.value[0]?.id ?? '',
        name: '',
        kind: 'new_issue',
        threshold: 10,
        windowMinutes: 5,
        enabled: true,
      }
  editing.value = true
}
async function saveRule() {
  saving.value = true
  error.value = ''
  try {
    if (ruleId.value) {
      const { name, kind, threshold, windowMinutes, enabled } = rule.value
      const body = { name, kind, threshold, windowMinutes, enabled }
      await http.patch(`/workspace/alert-rules/${ruleId.value}`, body)
    } else await http.post('/workspace/alert-rules', rule.value)
    editing.value = false
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to save rule'
  } finally {
    saving.value = false
  }
}
async function acknowledge(id: string) {
  saving.value = true
  try {
    await http.post(`/workspace/alerts/${id}/acknowledge`)
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to acknowledge alert'
  } finally {
    saving.value = false
  }
}
function detail(row: Row) {
  const project = projects.value.find((p) => p.id === (row.projectId ?? row.id))
  const params = {
    groupSlug: row.groupSlug ?? project?.groupSlug,
    projectSlug: row.projectSlug ?? project?.slug,
  }
  if (!params.groupSlug || !params.projectSlug) return undefined
  if (props.section === 'issues')
    return { name: 'project-issue-detail', params: { ...params, issueId: row.id } }
  if (props.section === 'alerts')
    return row.issueId
      ? { name: 'project-issue-detail', params: { ...params, issueId: row.issueId } }
      : { name: 'project-issues', params }
  if (props.section === 'ingestion') {
    if (project?.role === 'owner') return { name: 'project-setup', params }
    const module = ['issues', 'traces', 'metrics', 'logs', 'profiles', 'web-vitals'].find(
      (module) => project?.permissions.includes(`project:${module}:read`),
    )
    return module ? { name: `project-${module}`, params } : undefined
  }
  return undefined
}
watch(
  () => props.section,
  () => {
    page.value = 1
    rows.value = []
    for (const filter of [projectId, groupId, q, status, environment, from, to, action, actor])
      filter.value = ''
    rulePage.value = 1
    rules.value = []
    editing.value = false
    total.value = 0
    void load()
  },
)
onMounted(initialize)
</script>
<template>
  <AuditRecordsPanel
    v-if="section === 'audit'"
    v-model:project-id="projectId"
    v-model:action="action"
    v-model:actor="actor"
    v-model:from="from"
    v-model:to="to"
    :projects="allowedProjects"
    :records="rows"
    :total="total"
    :page="page"
    :loading="loading"
    :error="error"
    @apply="apply"
    @retry="initialize"
    @page-change="changePage($event - page)"
  />
  <AlertsPanel
    v-else-if="section === 'alerts'"
    v-model:project-id="projectId"
    v-model:group-id="groupId"
    v-model:from="from"
    v-model:to="to"
    v-model:editing="editing"
    v-model:rule="rule"
    :projects="allowedProjects"
    :owner-projects="ownerProjects"
    :groups="groups"
    :records="rows"
    :rules="rules"
    :total="total"
    :page="page"
    :rule-total="ruleTotal"
    :rule-page="rulePage"
    :loading="loading"
    :saving="saving"
    :error="error"
    :rule-id="ruleId"
    :detail="detail"
    @apply="apply"
    @retry="initialize"
    @page-change="changePage($event - page)"
    @rule-page-change="changeRulePage($event - rulePage)"
    @edit-rule="editRule"
    @save-rule="saveRule"
    @acknowledge="acknowledge"
  />
  <IssuesPanel
    v-else-if="section === 'issues'"
    v-model:project-id="projectId"
    v-model:group-id="groupId"
    v-model:query="q"
    v-model:status="status"
    v-model:environment="environment"
    v-model:from="from"
    v-model:to="to"
    :projects="allowedProjects"
    :groups="groups"
    :records="rows"
    :total="total"
    :page="page"
    :loading="loading"
    :error="error"
    :detail="detail"
    @apply="apply"
    @retry="initialize"
    @page-change="changePage($event - page)"
  />
  <IngestionPanel
    v-else
    v-model:project-id="projectId"
    v-model:group-id="groupId"
    :projects="allowedProjects"
    :groups="groups"
    :records="rows"
    :total="total"
    :page="page"
    :loading="loading"
    :error="error"
    :detail="detail"
    @apply="apply"
    @retry="initialize"
    @page-change="changePage($event - page)"
  />
</template>

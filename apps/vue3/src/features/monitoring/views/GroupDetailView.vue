<script setup lang="ts">
import { translate } from '@/i18n'

import EmptyState from '@/components/ui/empty-state/EmptyState.vue'
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getGroup, listProjects } from '../api/monitoring.api'
import type { MonitoringGroup, MonitoringProject } from '../model/types'

const route = useRoute()
const groupSlug = String(route.params.groupSlug)
const group = ref<MonitoringGroup | null>(null)
const projects = ref<MonitoringProject[]>([])
const loading = ref(true)
const error = ref('')

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    ;[group.value, projects.value] = await Promise.all([
      getGroup(groupSlug),
      listProjects(groupSlug),
    ])
  } catch {
    error.value = 'Unable to load group details'
  } finally {
    loading.value = false
  }
}

function projectDestination(project: MonitoringProject): string {
  if (project.role === 'owner') return 'project-setup'
  const module = ['issues', 'traces', 'metrics', 'web-vitals', 'logs', 'profiles'].find((module) =>
    project.permissions?.includes(`project:${module}:read`),
  )
  if (module) return `project-${module}`
  return project.permissions?.includes('project:audit:read') ? 'workspace-audit' : 'forbidden'
}

onMounted(load)
</script>

<template>
  <section class="space-y-6">
    <p v-if="loading" class="text-muted-foreground">{{ translate('Loading…') }}</p>
    <div v-else-if="error" class="space-y-3" role="alert">
      <p class="text-destructive">{{ translate(error) }}</p>
      <Button variant="outline" @click="load">{{ translate('Retry') }}</Button>
    </div>
    <template v-else-if="group">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h2 class="page-title">{{ group.name }}</h2>
          <p class="mt-1 text-muted-foreground">
            {{ translate('Manage Vue monitoring projects in this group.') }}
          </p>
        </div>
        <Button v-if="group.isOwner" as-child>
          <RouterLink :to="{ name: 'create-project', params: { groupSlug: group.id } }">{{
            translate('Create project')
          }}</RouterLink>
        </Button>
      </div>

      <Card v-if="projects.length === 0">
        <EmptyState
          class="p-8"
          :title="translate('No monitoring projects yet')"
          :description="translate('Create a Vue project to get a DSN and setup instructions.')"
        />
      </Card>
      <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <RouterLink
          v-for="project in projects"
          :key="project.id"
          :to="{
            name: projectDestination(project),
            params: { groupSlug: group.id, projectSlug: project.id },
          }"
        >
          <Card class="h-full transition-colors hover:bg-muted/30">
            <CardHeader>
              <CardTitle>{{ project.name }}</CardTitle>
              <p class="text-sm text-muted-foreground">{{ project.role }}</p>
              <CardDescription
                >{{
                  translate(
                    project.connected ? 'Previously connected' : 'Awaiting first connection',
                  )
                }}
                {{ translate('· Vue') }}</CardDescription
              >
            </CardHeader>
          </Card>
        </RouterLink>
      </div>
    </template>
  </section>
</template>

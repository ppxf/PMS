<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { http } from '@/services/http'
import { ref } from 'vue'
import { useProjectAccessStore } from '@/features/monitoring/model/project-access.store'
import {
  Bug,
  Bell,
  ShieldCheck,
  Flame,
  Gauge,
  Logs,
  ChartNoAxesCombined,
  FolderKanban,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Plug,
  Workflow,
  Settings,
  Activity,
  Users,
} from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAuthStore } from '@/features/auth'

import type { Component } from 'vue'
import type { PermissionRequirement } from '@/features/auth'

defineOptions({ name: 'AppLayout' })

interface NavigationItem {
  label: string
  routeName: string
  activeRouteNames: string[]
  icon: Component
  permissions?: PermissionRequirement
}

interface ProjectNavigationItem {
  label: string
  routeName: string
  activeRouteNames: string[]
  icon: Component
  children?: { label: string; routeName: string }[]
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const projectAccess = useProjectAccessStore()
const visibleProjectNavigation = computed(() =>
  projectNavigation.filter((item) => projectAccess.canRoute(item.routeName)),
)

const workspaceAuditAvailable = ref(false)
onMounted(async () => {
  try {
    workspaceAuditAvailable.value = (
      await http.get<{ canRead: boolean }>('/audit-records/capabilities')
    ).canRead
  } catch {
    workspaceAuditAvailable.value = false
  }
})
const navigation: NavigationItem[] = [
  {
    label: 'Dashboard',
    routeName: 'dashboard',
    activeRouteNames: ['dashboard'],
    icon: LayoutDashboard,
  },
  ...(['issues', 'alerts', 'ingestion'] as const).map((section) => ({
    label: {
      issues: 'Issue center',
      alerts: 'Alerts',
      ingestion: 'Ingestion status',
      audit: 'Audit records',
    }[section],
    routeName: `workspace-${section}`,
    activeRouteNames: [`workspace-${section}`],
    icon: { issues: Bug, alerts: Bell, ingestion: Plug }[section],
  })),
  {
    label: 'Groups and projects',
    routeName: 'groups',
    activeRouteNames: ['groups', 'group-detail', 'create-project'],
    icon: FolderKanban,
  },
  {
    label: 'Audit records',
    routeName: 'workspace-audit',
    activeRouteNames: ['workspace-audit'],
    icon: ShieldCheck,
  },
  {
    label: 'Users',
    routeName: 'users',
    activeRouteNames: ['users'],
    icon: Users,
    permissions: 'user:read',
  },
]

const projectNavigation: ProjectNavigationItem[] = [
  {
    label: 'SDK setup',
    routeName: 'project-setup',
    activeRouteNames: [
      'project-setup',
      'project-traces-setup',
      'project-metrics-setup',
      'project-logs-setup',
      'project-profiles-setup',
    ],
    children: [
      { label: 'Basic setup', routeName: 'project-setup' },
      { label: 'Traces setup', routeName: 'project-traces-setup' },
      { label: 'Metrics setup', routeName: 'project-metrics-setup' },
      { label: 'Logs setup', routeName: 'project-logs-setup' },
      { label: 'Profiles setup', routeName: 'project-profiles-setup' },
    ],
    icon: Plug,
  },
  {
    label: 'Members',
    routeName: 'project-members',
    activeRouteNames: ['project-members'],
    icon: Users,
  },
  {
    label: 'Profiles',
    routeName: 'project-profiles',
    activeRouteNames: ['project-profiles', 'project-profile-detail'],
    icon: Flame,
  },
  { label: 'Logs', routeName: 'project-logs', activeRouteNames: ['project-logs'], icon: Logs },
  {
    label: 'Web Vitals',
    icon: Gauge,
    routeName: 'project-web-vitals',
    activeRouteNames: ['project-web-vitals', 'project-web-vitals-detail'],
  },
  {
    label: 'Metrics',
    routeName: 'project-metrics',
    activeRouteNames: ['project-metrics'],
    icon: ChartNoAxesCombined,
  },
  {
    label: 'Errors',
    routeName: 'project-issues',
    activeRouteNames: ['project-issues', 'project-issue-detail'],
    icon: Bug,
  },
  {
    label: 'Traces',
    routeName: 'project-traces',
    activeRouteNames: ['project-traces', 'project-trace-detail'],
    icon: Workflow,
  },
  {
    label: 'Settings',
    routeName: 'project-detail',
    activeRouteNames: ['project-detail'],
    icon: Settings,
  },
]

const visibleNavigation = computed(() =>
  navigation.filter(
    (item) =>
      auth.can(item.permissions) &&
      (item.routeName !== 'workspace-audit' || workspaceAuditAvailable.value),
  ),
)
const currentRouteName = computed(() => String(route.name ?? ''))
const currentProject = computed(() => {
  const groupSlug = route.params.groupSlug
  const projectSlug = route.params.projectSlug

  if (typeof groupSlug !== 'string' || typeof projectSlug !== 'string') return null

  return { groupSlug, projectSlug }
})

function isActive(routeNames: string[]): boolean {
  return routeNames.includes(currentRouteName.value)
}

async function logout(): Promise<void> {
  auth.logout()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <div class="min-h-screen bg-muted/30 lg:grid lg:grid-cols-[240px_1fr]">
    <aside class="border-r bg-background">
      <div class="flex h-16 items-center gap-2 px-5">
        <div class="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Activity class="size-5" aria-hidden="true" />
        </div>
        <p class="font-semibold">PMS</p>
      </div>

      <Separator />

      <nav class="space-y-1 p-3" aria-label="Main navigation">
        <p class="px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">Workbench</p>
        <template v-for="item in visibleNavigation" :key="item.routeName">
          <p
            v-if="
              item.routeName === 'workspace-audit' ||
              (item.routeName === 'users' && !workspaceAuditAvailable)
            "
            class="px-3 pt-5 pb-2 text-xs font-semibold uppercase text-muted-foreground"
          >
            Management
          </p>
          <RouterLink
            :to="{ name: item.routeName }"
            class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            :class="{ 'bg-muted text-foreground': isActive(item.activeRouteNames) }"
            active-class=""
          >
            <component :is="item.icon" class="size-4" />
            {{ item.label }}
          </RouterLink>
        </template>
        <div v-if="currentProject">
          <p
            data-testid="current-project-navigation"
            class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground"
          >
            <FolderOpen class="size-4" />
            Current project
          </p>
          <template v-for="item in visibleProjectNavigation" :key="item.routeName">
            <div v-if="item.children" class="ml-3">
              <p
                class="flex items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground"
              >
                <component :is="item.icon" class="size-4" />
                {{ item.label }}
              </p>
              <div class="ml-5 space-y-1 border-l pl-3">
                <RouterLink
                  v-for="child in item.children"
                  :key="child.routeName"
                  :to="{ name: child.routeName, params: currentProject }"
                  class="block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  :class="{ 'bg-muted text-foreground font-medium': isActive([child.routeName]) }"
                  :aria-current="isActive([child.routeName]) ? 'page' : undefined"
                  active-class=""
                >
                  {{ child.label }}
                </RouterLink>
              </div>
            </div>
            <RouterLink
              v-else
              :to="{
                name: item.routeName,
                params: {
                  groupSlug: currentProject.groupSlug,
                  projectSlug: currentProject.projectSlug,
                },
              }"
              class="ml-3 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              :class="{ 'bg-muted text-foreground': isActive(item.activeRouteNames) }"
              active-class=""
            >
              <component :is="item.icon" class="size-4" />
              {{ item.label }}
            </RouterLink>
          </template>
        </div>
      </nav>
    </aside>

    <div class="min-w-0">
      <header
        class="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/90 px-6 backdrop-blur"
      >
        <h1 class="font-semibold">{{ route.meta.title }}</h1>

        <div class="flex items-center gap-3">
          <div class="hidden text-right sm:block">
            <p class="text-sm font-medium">{{ auth.user?.name }}</p>
            <p class="text-xs text-muted-foreground">{{ auth.user?.email }}</p>
          </div>
          <Button type="button" variant="outline" size="sm" @click="logout">
            <LogOut />
            Sign out
          </Button>
        </div>
      </header>

      <main class="p-4 sm:p-6 lg:p-8">
        <RouterView />
      </main>
    </div>
  </div>
</template>

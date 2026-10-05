<script setup lang="ts">
import { computed } from 'vue'
import {
  Bug,
  ChartNoAxesCombined,
  FolderKanban,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Plug,
  Settings,
  ShieldCheck,
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

const navigation: NavigationItem[] = [
  {
    label: '首页',
    routeName: 'dashboard',
    activeRouteNames: ['dashboard'],
    icon: LayoutDashboard,
  },
  {
    label: '组与项目',
    routeName: 'groups',
    activeRouteNames: ['groups', 'group-detail', 'create-project'],
    icon: FolderKanban,
  },
  {
    label: '用户管理',
    routeName: 'users',
    activeRouteNames: ['users'],
    icon: Users,
    permissions: 'user:read',
  },
]

const projectNavigation: ProjectNavigationItem[] = [
  {
    label: '查看 Metrics',
    routeName: 'project-metrics',
    activeRouteNames: ['project-metrics'],
    icon: ChartNoAxesCombined,
  },
  {
    label: '查看 SDK 接入',
    routeName: 'project-setup',
    activeRouteNames: ['project-setup', 'project-traces-setup'],
    children: [
      { label: '基础接入', routeName: 'project-setup' },
      { label: 'Traces接入', routeName: 'project-traces-setup' },
    ],
    icon: Plug,
  },
  {
    label: '查看错误',
    routeName: 'project-issues',
    activeRouteNames: ['project-issues', 'project-issue-detail'],
    icon: Bug,
  },
  {
    label: '功能配置',
    routeName: 'project-detail',
    activeRouteNames: ['project-detail'],
    icon: Settings,
  },
  {
    label: '查看 Traces',
    routeName: 'project-traces',
    activeRouteNames: ['project-traces', 'project-trace-detail'],
    icon: Plug,
  },
]

const visibleNavigation = computed(() => navigation.filter((item) => auth.can(item.permissions)))
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
          <ShieldCheck class="size-5" />
        </div>
        <div>
          <p class="font-semibold">PMS CMS</p>
          <p class="text-xs text-muted-foreground">Vue 管理后台</p>
        </div>
      </div>

      <Separator />

      <nav class="space-y-1 p-3" aria-label="主导航">
        <RouterLink
          v-for="item in visibleNavigation"
          :key="item.routeName"
          :to="{ name: item.routeName }"
          class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          :class="{ 'bg-muted text-foreground': isActive(item.activeRouteNames) }"
          active-class=""
        >
          <component :is="item.icon" class="size-4" />
          {{ item.label }}
        </RouterLink>

        <div v-if="currentProject">
          <p
            data-testid="current-project-navigation"
            class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground"
          >
            <FolderOpen class="size-4" />
            当前项目
          </p>
          <template v-for="item in projectNavigation" :key="item.routeName">
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
        <div>
          <h1 class="font-semibold">{{ route.meta.title }}</h1>
          <p class="text-xs text-muted-foreground">生产级 Vue 基础框架</p>
        </div>

        <div class="flex items-center gap-3">
          <div class="hidden text-right sm:block">
            <p class="text-sm font-medium">{{ auth.user?.name }}</p>
            <p class="text-xs text-muted-foreground">{{ auth.user?.email }}</p>
          </div>
          <Button type="button" variant="outline" size="sm" @click="logout">
            <LogOut />
            退出
          </Button>
        </div>
      </header>

      <main class="p-4 sm:p-6 lg:p-8">
        <RouterView />
      </main>
    </div>
  </div>
</template>

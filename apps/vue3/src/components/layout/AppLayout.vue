<script setup lang="ts">
import { computed } from 'vue'
import { FolderKanban, LayoutDashboard, LogOut, ShieldCheck, Users } from '@lucide/vue'
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
  icon: Component
  permissions?: PermissionRequirement
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const navigation: NavigationItem[] = [
  {
    label: '工作台',
    routeName: 'dashboard',
    icon: LayoutDashboard,
  },
  {
    label: '组与项目',
    routeName: 'groups',
    icon: FolderKanban,
  },
  {
    label: '用户管理',
    routeName: 'users',
    icon: Users,
    permissions: 'user:read',
  },
]

const visibleNavigation = computed(() => navigation.filter((item) => auth.can(item.permissions)))

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
          active-class="bg-muted text-foreground"
        >
          <component :is="item.icon" class="size-4" />
          {{ item.label }}
        </RouterLink>
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

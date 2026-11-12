<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { http } from '@/services/http'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Users, Mail, ShieldCheck, UserPlus, Send } from '@lucide/vue'
import { projectModules } from '../model/project-access.store'
interface Member {
  role: 'owner' | 'member'
  userId: string
  email: string
  name?: string
  permissions: string[]
}
interface Invitation {
  id: string
  email: string
  permissions: string[]
  acceptedAt?: string
  revokedAt?: string
  deliveryStatus?: string
  expiresAt: string
}
const route = useRoute()
const base = `/groups/${encodeURIComponent(String(route.params.groupSlug ?? ''))}/projects/${encodeURIComponent(String(route.params.projectSlug ?? ''))}`
const members = ref<Member[]>([])
const invitations = ref<Invitation[]>([])
const email = ref('')
const permissions = ref<string[]>([])
const error = ref('')
const busy = ref(false)
const options = [
  ...projectModules.map((module) => ({
    label: {
      issues: 'Errors',
      traces: 'Traces',
      metrics: 'Metrics',
      'web-vitals': 'Web Vitals',
      logs: 'Logs',
      profiles: 'Profiles',
    }[module],
    value: `project:${module}:read`,
  })),
  { label: 'Audit records', value: 'project:audit:read' },
]
async function load() {
  ;[members.value, invitations.value] = await Promise.all([
    http.get<Member[]>(`${base}/members`),
    http.get<Invitation[]>(`${base}/invitations`),
  ])
}
async function action(operation: () => Promise<unknown>) {
  busy.value = true
  error.value = ''
  try {
    await operation()
    await load()
  } catch {
    error.value = 'Unable to update project access. Please try again.'
  } finally {
    busy.value = false
  }
}
async function invite() {
  await action(() =>
    http.post(`${base}/invitations`, { email: email.value, permissions: permissions.value }),
  )
  if (!error.value) email.value = ''
}
onMounted(() => action(async () => {}))
</script>
<template>
  <main class="mx-auto max-w-6xl space-y-8">
    <header class="flex items-start gap-4">
      <div
        class="grid size-12 shrink-0 place-items-center rounded-xl border bg-background shadow-sm"
      >
        <Users class="size-6 text-primary" />
      </div>
      <div>
        <h1 class="page-title">Members and invitations</h1>
        <p class="mt-2 text-sm text-muted-foreground">
          Manage who can access this project and what they can view.
        </p>
      </div>
    </header>
    <p
      v-if="error"
      role="alert"
      class="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
    >
      {{ error }}
    </p>

    <form class="overflow-hidden rounded-xl border bg-card shadow-sm" @submit.prevent="invite">
      <div class="flex items-center gap-3 border-b bg-muted/20 px-6 py-5">
        <UserPlus class="size-5 text-primary" />
        <div>
          <h2 class="font-semibold">Invite a member</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            Send an email invitation with access to selected pages.
          </p>
        </div>
      </div>
      <div class="space-y-6 p-6">
        <div class="max-w-xl space-y-2">
          <label for="invite-email" class="text-sm font-medium">Email address</label
          ><Input
            id="invite-email"
            v-model="email"
            required
            type="email"
            placeholder="colleague@company.com"
            class="h-10"
          />
          <p class="text-xs text-muted-foreground">
            New users will register and verify their email before joining.
          </p>
        </div>
        <fieldset>
          <legend class="mb-1 text-sm font-medium">Page access</legend>
          <p class="mb-3 text-xs text-muted-foreground">
            Choose at least one page. Members receive read-only access.
          </p>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <label
              v-for="option in options"
              :key="option.value"
              class="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-3 text-sm transition-colors hover:bg-muted/50"
              :class="
                permissions.includes(option.value)
                  ? 'border-primary/40 bg-primary/5 text-primary'
                  : 'text-muted-foreground'
              "
              ><input
                v-model="permissions"
                type="checkbox"
                :value="option.value"
                class="size-4 accent-primary"
                :disabled="busy"
              />{{ option.label }}</label
            >
          </div>
        </fieldset>
      </div>
      <footer
        class="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-6 py-4"
      >
        <p class="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck class="size-4" />Only the project owner can manage access.
        </p>
        <Button type="submit" :disabled="busy || !permissions.length"
          ><Send class="size-4" />{{ busy ? 'Please wait…' : 'Send invitation' }}</Button
        >
      </footer>
    </form>

    <section class="overflow-hidden rounded-xl border bg-card shadow-sm">
      <header class="flex items-center justify-between border-b px-6 py-5">
        <div class="flex items-center gap-2.5">
          <Users class="size-4 text-muted-foreground" />
          <h2 class="font-semibold">Project members</h2>
          <span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{{
            members.length
          }}</span>
        </div>
        <span class="text-xs text-muted-foreground">Active project access</span>
      </header>
      <div v-if="!members.length" class="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <div class="mb-1 rounded-full bg-muted p-3">
          <Users class="size-5 text-muted-foreground" />
        </div>
        <p class="text-sm font-medium">No members to display</p>
        <p class="text-xs text-muted-foreground">
          Accepted invitations will appear here as project members.
        </p>
      </div>
      <article
        v-for="member in members"
        :key="member.userId"
        class="space-y-4 border-b p-6 last:border-b-0"
      >
        <div class="flex items-center gap-3">
          <div
            class="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
          >
            {{ (member.name || member.email).slice(0, 1).toUpperCase() }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{{ member.name || member.email }}</p>
            <p class="truncate text-xs text-muted-foreground">{{ member.email }}</p>
          </div>
          <span
            class="rounded-full border px-2.5 py-1 text-xs"
            :class="
              member.role === 'owner'
                ? 'border-primary/20 bg-primary/5 text-primary'
                : 'bg-muted text-muted-foreground'
            "
            >{{ member.role === 'owner' ? 'Owner' : 'Member' }}</span
          >
        </div>
        <p
          v-if="member.role === 'owner'"
          class="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <ShieldCheck class="size-4" />Full access to all pages, settings and member management.
        </p>
        <template v-else
          ><fieldset class="flex flex-wrap gap-x-5 gap-y-3">
            <legend class="sr-only">Permissions for {{ member.email }}</legend>
            <label
              v-for="option in options"
              :key="option.value"
              class="flex items-center gap-2 text-sm"
              ><input
                v-model="member.permissions"
                type="checkbox"
                :value="option.value"
                class="size-4 accent-primary"
                :disabled="busy"
              />{{ option.label }}</label
            >
          </fieldset>
          <div class="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              :disabled="busy || !member.permissions.length"
              @click="
                action(() =>
                  http.patch(`${base}/members/${member.userId}`, {
                    permissions: member.permissions,
                  }),
                )
              "
              >Save permissions</Button
            ><Button
              size="sm"
              variant="ghost"
              class="text-destructive hover:bg-destructive/5 hover:text-destructive"
              :disabled="busy"
              @click="action(() => http.delete(`${base}/members/${member.userId}`))"
              >Remove member</Button
            >
          </div></template
        >
      </article>
    </section>

    <section class="overflow-hidden rounded-xl border bg-card shadow-sm">
      <header class="flex items-center justify-between border-b px-6 py-5">
        <div class="flex items-center gap-2.5">
          <Mail class="size-4 text-muted-foreground" />
          <h2 class="font-semibold">Invitation history</h2>
          <span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{{
            invitations.length
          }}</span>
        </div>
        <span class="text-xs text-muted-foreground">Sent email invitations</span>
      </header>
      <div
        v-if="!invitations.length"
        class="flex flex-col items-center gap-2 px-6 py-10 text-center"
      >
        <div class="mb-1 rounded-full bg-muted p-3">
          <Mail class="size-5 text-muted-foreground" />
        </div>
        <p class="text-sm font-medium">No invitations yet</p>
        <p class="text-xs text-muted-foreground">
          Invite a colleague using the form above to get started.
        </p>
      </div>
      <article
        v-for="invitation in invitations"
        :key="invitation.id"
        class="flex flex-wrap items-start justify-between gap-4 border-b p-6 last:border-b-0"
      >
        <div class="min-w-0 space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <p class="break-all text-sm font-medium">{{ invitation.email }}</p>
            <span
              class="rounded-full border px-2 py-0.5 text-xs"
              :class="
                invitation.acceptedAt
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'bg-muted text-muted-foreground'
              "
              >{{
                invitation.acceptedAt
                  ? 'Accepted'
                  : invitation.revokedAt
                    ? 'Revoked'
                    : new Date(invitation.expiresAt).getTime() < Date.now()
                      ? 'Expired'
                      : 'Pending'
              }}</span
            ><span v-if="invitation.deliveryStatus === 'failed'" class="text-xs text-destructive"
              >Email delivery failed</span
            >
          </div>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="permission in invitation.permissions"
              :key="permission"
              class="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
              >{{
                options.find((option) => option.value === permission)?.label || permission
              }}</span
            >
          </div>
          <p class="text-xs text-muted-foreground">
            Expires {{ new Date(invitation.expiresAt).toLocaleString() }}
          </p>
        </div>
        <div class="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            :disabled="busy"
            @click="action(() => http.post(`${base}/invitations/${invitation.id}/resend`, {}))"
            >Resend</Button
          ><Button
            size="sm"
            variant="ghost"
            class="text-destructive hover:bg-destructive/5 hover:text-destructive"
            :disabled="busy"
            @click="action(() => http.post(`${base}/invitations/${invitation.id}/revoke`, {}))"
            >Revoke</Button
          >
        </div>
      </article>
    </section>
  </main>
</template>

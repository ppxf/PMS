<script setup lang="ts">
import { translate } from '@/i18n'

import { computed, h, ref } from 'vue'
import { Plus, Trash2 } from '@lucide/vue'
import { createColumnHelper } from '@tanstack/vue-table'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { z } from 'zod'

import { DataTable } from '@/components/data-table'
import { AppFormField } from '@/components/forms'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

import type { DataTableFeatures } from '@/components/data-table'
import type { User } from '../model/user'

const users = ref<User[]>([
  {
    id: '1',
    name: 'Alex Morgan',
    email: 'admin@example.com',
    role: 'Administrator',
    status: 'active',
  },
  {
    id: '2',
    name: 'Content Editor',
    email: 'editor@example.com',
    role: 'Editor',
    status: 'active',
  },
  {
    id: '3',
    name: 'Inactive Account',
    email: 'disabled@example.com',
    role: 'Viewer',
    status: 'disabled',
  },
])

const columnHelper = createColumnHelper<DataTableFeatures, User>()
const columns = columnHelper.columns([
  columnHelper.accessor('name', {
    header: 'Name',
  }),
  columnHelper.accessor('email', {
    header: 'Email',
  }),
  columnHelper.accessor('role', {
    header: 'Role',
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: ({ row }) =>
      h(
        Badge,
        {
          variant: row.original.status === 'active' ? 'default' : 'secondary',
        },
        () => translate(row.original.status === 'active' ? 'Active' : 'Inactive'),
      ),
  }),
])

const page = ref(1)
const pageSize = ref(10)
const selectedUsers = ref<User[]>([])
const dialogOpen = ref(false)

const userSchema = toTypedSchema(
  z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Enter a valid email address'),
    role: z.string().min(1, 'Enter a role'),
  }),
)

const { handleSubmit, resetForm } = useForm({
  validationSchema: userSchema,
  initialValues: {
    name: '',
    email: '',
    role: 'Editor',
  },
})

const selectedSummary = computed(() =>
  selectedUsers.value.length
    ? `${selectedUsers.value.length} ${selectedUsers.value.length === 1 ? 'user' : 'users'} selected`
    : 'Select users to manage',
)

const createUser = handleSubmit((values) => {
  users.value = [
    ...users.value,
    {
      id: crypto.randomUUID(),
      name: values.name,
      email: values.email,
      role: values.role,
      status: 'active',
    },
  ]
  dialogOpen.value = false
  resetForm()
})
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 class="page-title">{{ translate('Users') }}</h2>
        <p class="mt-1 text-muted-foreground">
          {{ translate('Manage users, roles, and account status.') }}
        </p>
      </div>

      <Button
        v-permission="{ permissions: 'user:create', behavior: 'disable' }"
        type="button"
        @click="dialogOpen = true"
      >
        <Plus />
        {{ translate('Add user') }}
      </Button>
    </div>

    <div class="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
      <p class="text-sm text-muted-foreground">{{ translate(selectedSummary) }}</p>
      <Button
        v-permission="{ permissions: 'user:delete', behavior: 'disable' }"
        type="button"
        variant="destructive"
        size="sm"
        :disabled="selectedUsers.length === 0"
      >
        <Trash2 />
        {{ translate('Delete selected') }}
      </Button>
    </div>

    <DataTable
      v-model:page="page"
      v-model:page-size="pageSize"
      :columns="columns"
      :data="users"
      :row-key="(user) => user.id"
      selectable
      @selection-change="selectedUsers = $event"
    />

    <Dialog v-model:open="dialogOpen">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{{ translate('Add user') }}</DialogTitle>
          <DialogDescription>
            {{ translate('Enter the details for the new user.') }}
          </DialogDescription>
        </DialogHeader>

        <form class="space-y-4" novalidate @submit="createUser">
          <AppFormField v-slot="{ componentField }" name="name" :label="translate('Name')" required>
            <Input v-bind="componentField" :placeholder="translate('Enter a name')" />
          </AppFormField>

          <AppFormField
            v-slot="{ componentField }"
            name="email"
            :label="translate('Email')"
            required
          >
            <Input v-bind="componentField" type="email" placeholder="name@example.com" />
          </AppFormField>

          <AppFormField
            v-slot="{ componentField }"
            name="role"
            :label="translate('Role')"
            :description="translate('Choose the role for this user.')"
            required
          >
            <Input v-bind="componentField" :placeholder="translate('For example: Editor')" />
          </AppFormField>

          <DialogFooter>
            <Button type="button" variant="outline" @click="dialogOpen = false">
              {{ translate('Cancel') }}
            </Button>
            <Button type="submit">{{ translate('Save') }}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </section>
</template>

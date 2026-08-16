<script setup lang="ts">
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
    name: '周安发',
    email: 'admin@example.com',
    role: '管理员',
    status: 'active',
  },
  {
    id: '2',
    name: '内容编辑',
    email: 'editor@example.com',
    role: '编辑',
    status: 'active',
  },
  {
    id: '3',
    name: '停用账号',
    email: 'disabled@example.com',
    role: '访客',
    status: 'disabled',
  },
])

const columnHelper = createColumnHelper<DataTableFeatures, User>()
const columns = columnHelper.columns([
  columnHelper.accessor('name', {
    header: '姓名',
  }),
  columnHelper.accessor('email', {
    header: '邮箱',
  }),
  columnHelper.accessor('role', {
    header: '角色',
  }),
  columnHelper.accessor('status', {
    header: '状态',
    cell: ({ row }) =>
      h(
        Badge,
        {
          variant: row.original.status === 'active' ? 'default' : 'secondary',
        },
        () => (row.original.status === 'active' ? '启用' : '停用'),
      ),
  }),
])

const page = ref(1)
const pageSize = ref(10)
const selectedUsers = ref<User[]>([])
const dialogOpen = ref(false)

const userSchema = toTypedSchema(
  z.object({
    name: z.string().min(2, '姓名至少需要 2 个字符'),
    email: z.string().email('请输入正确的邮箱'),
    role: z.string().min(1, '请输入角色'),
  }),
)

const { handleSubmit, resetForm } = useForm({
  validationSchema: userSchema,
  initialValues: {
    name: '',
    email: '',
    role: '编辑',
  },
})

const selectedSummary = computed(() =>
  selectedUsers.value.length
    ? `已选择 ${selectedUsers.value.length} 个用户`
    : '请选择需要操作的用户',
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
        <h2 class="text-2xl font-semibold tracking-tight">用户管理</h2>
        <p class="mt-1 text-muted-foreground">
          示例展示 TanStack Table、VeeValidate、Zod 与权限指令的组合。
        </p>
      </div>

      <Button
        v-permission="{ permissions: 'user:create', behavior: 'disable' }"
        type="button"
        @click="dialogOpen = true"
      >
        <Plus />
        新增用户
      </Button>
    </div>

    <div class="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
      <p class="text-sm text-muted-foreground">{{ selectedSummary }}</p>
      <Button
        v-permission="{ permissions: 'user:delete', behavior: 'disable' }"
        type="button"
        variant="destructive"
        size="sm"
        :disabled="selectedUsers.length === 0"
      >
        <Trash2 />
        批量删除
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
          <DialogTitle>新增用户</DialogTitle>
          <DialogDescription>
            表单字段、错误提示和可访问性属性由公共封装统一处理。
          </DialogDescription>
        </DialogHeader>

        <form class="space-y-4" novalidate @submit="createUser">
          <AppFormField v-slot="{ componentField }" name="name" label="姓名" required>
            <Input v-bind="componentField" placeholder="请输入姓名" />
          </AppFormField>

          <AppFormField v-slot="{ componentField }" name="email" label="邮箱" required>
            <Input v-bind="componentField" type="email" placeholder="name@example.com" />
          </AppFormField>

          <AppFormField
            v-slot="{ componentField }"
            name="role"
            label="角色"
            description="后续可替换为角色 Select 和远程选项。"
            required
          >
            <Input v-bind="componentField" placeholder="例如：编辑" />
          </AppFormField>

          <DialogFooter>
            <Button type="button" variant="outline" @click="dialogOpen = false"> 取消 </Button>
            <Button type="submit">保存</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </section>
</template>

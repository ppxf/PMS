<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { createGroup } from '../api/monitoring.api'
import { useOnboardingStore } from '../model/onboarding.store'
import { AppError } from '@/services/http'

const router = useRouter()
const onboarding = useOnboardingStore()
const name = ref('')
const submitting = ref(false)
const error = ref('')

async function submit(): Promise<void> {
  error.value = ''
  submitting.value = true
  try {
    const group = await createGroup({ name: name.value })
    onboarding.addGroup(group)
    await router.push({ name: 'create-project', params: { groupSlug: group.slug } })
  } catch (cause) {
    error.value = cause instanceof AppError ? cause.message : '创建组失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="grid min-h-screen place-items-center bg-muted/40 p-4">
    <Card class="w-full max-w-lg">
      <CardHeader>
        <CardTitle>创建第一个组</CardTitle>
        <CardDescription>监控项目将归属到组中，之后还可以继续创建更多组。</CardDescription>
      </CardHeader>
      <CardContent>
        <p v-if="error" role="alert" class="mb-4 text-sm text-destructive">{{ error }}</p>
        <form class="space-y-4" @submit.prevent="submit">
          <label class="grid gap-2 text-sm font-medium">
            组名称
            <Input v-model="name" name="name" required minlength="2" placeholder="例如：前端团队" />
          </label>
          <Button class="w-full" :disabled="submitting" type="submit">
            {{ submitting ? '创建中…' : '创建组并继续' }}
          </Button>
        </form>
      </CardContent>
    </Card>
  </main>
</template>

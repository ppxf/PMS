<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { verifyEmail } from '@/features/auth/api/auth.api'
import { AppError } from '@/services/http'
const route = useRoute()
const message = ref('正在验证邮箱…')
const error = ref('')
onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : ''
  if (!token) {
    error.value = '验证链接无效或已过期'
    message.value = ''
    return
  }
  try {
    message.value = (await verifyEmail(token)).message
  } catch (e) {
    message.value = ''
    error.value = e instanceof AppError ? e.message : '验证链接无效或已过期'
  }
})
</script>
<template>
  <main class="grid min-h-screen place-items-center bg-muted/40 p-4">
    <section class="w-full max-w-md space-y-5 rounded-xl bg-card p-6 shadow">
      <h1 class="text-2xl font-semibold">邮箱验证</h1>
      <p v-if="message" role="status">{{ message }}</p>
      <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
      <RouterLink to="/login" class="text-sm text-primary">前往登录</RouterLink>
    </section>
  </main>
</template>

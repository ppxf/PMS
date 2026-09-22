<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { forgotPassword } from '@/features/auth/api/auth.api'
import { AppError } from '@/services/http'
const email = ref('')
const message = ref('')
const error = ref('')
const submitting = ref(false)
async function submit() {
  error.value = ''
  submitting.value = true
  try {
    message.value = (await forgotPassword(email.value)).message
  } catch (e) {
    error.value = e instanceof AppError ? e.message : '请求失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}
</script>
<template>
  <main class="grid min-h-screen place-items-center bg-muted/40 p-4">
    <section class="w-full max-w-md space-y-5 rounded-xl bg-card p-6 shadow">
      <h1 class="text-2xl font-semibold">忘记密码</h1>
      <p v-if="message" role="status">{{ message }}</p>
      <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
      <form v-if="!message" class="space-y-4" @submit.prevent="submit">
        <input
          v-model="email"
          class="w-full rounded border p-2"
          required
          type="email"
          placeholder="邮箱"
        /><button
          class="w-full rounded bg-primary p-2 text-primary-foreground"
          :disabled="submitting"
        >
          发送重置邮件
        </button>
      </form>
      <RouterLink to="/login" class="text-sm text-primary">返回登录</RouterLink>
    </section>
  </main>
</template>

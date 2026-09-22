<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { register } from '@/features/auth/api/auth.api'
import { AppError } from '@/services/http'

const name = ref('')
const email = ref('')
const password = ref('')
const confirmation = ref('')
const message = ref('')
const error = ref('')
const submitting = ref(false)
async function submit() {
  error.value = ''
  message.value = ''
  if (password.value.length < 8) {
    error.value = '密码至少需要 8 位'
    return
  }
  if (password.value !== confirmation.value) {
    error.value = '两次输入的密码不一致'
    return
  }
  submitting.value = true
  try {
    message.value = (
      await register({
        name: name.value,
        email: email.value,
        password: password.value,
        passwordConfirmation: confirmation.value,
      })
    ).message
  } catch (e) {
    error.value = e instanceof AppError ? e.message : '注册失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="grid min-h-screen place-items-center bg-muted/40 p-4">
    <section class="w-full max-w-md space-y-5 rounded-xl bg-card p-6 shadow">
      <h1 class="text-2xl font-semibold">创建账号</h1>
      <p v-if="message" role="status">{{ message }}</p>
      <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
      <form v-if="!message" class="space-y-4" @submit.prevent="submit">
        <input v-model="name" class="w-full rounded border p-2" required placeholder="姓名" /><input
          v-model="email"
          class="w-full rounded border p-2"
          required
          type="email"
          placeholder="邮箱"
        /><input
          v-model="password"
          class="w-full rounded border p-2"
          required
          type="password"
          placeholder="密码（至少 8 位）"
        /><input
          v-model="confirmation"
          class="w-full rounded border p-2"
          required
          type="password"
          placeholder="确认密码"
        /><button
          class="w-full rounded bg-primary p-2 text-primary-foreground"
          :disabled="submitting"
        >
          {{ submitting ? '提交中…' : '注册' }}
        </button>
      </form>
      <RouterLink to="/login" class="text-sm text-primary">返回登录</RouterLink>
    </section>
  </main>
</template>

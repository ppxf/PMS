<script setup lang="ts">
import { ref } from 'vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { RouterLink, useRoute } from 'vue-router'
import { resetPassword } from '@/features/auth/api/auth.api'
import { AppError } from '@/services/http'
const route = useRoute()
const password = ref('')
const confirmation = ref('')
const message = ref('')
const error = ref('')
const submitting = ref(false)
async function submit() {
  error.value = ''
  const token = typeof route.query.token === 'string' ? route.query.token : ''
  if (!token) {
    error.value = 'The reset link is invalid or has expired'
    return
  }
  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters'
    return
  }
  if (password.value !== confirmation.value) {
    error.value = 'Passwords do not match'
    return
  }
  submitting.value = true
  try {
    message.value = (
      await resetPassword({
        token,
        password: password.value,
        passwordConfirmation: confirmation.value,
      })
    ).message
    password.value = ''
    confirmation.value = ''
  } catch (e) {
    error.value = e instanceof AppError ? e.message : 'Password reset failed'
  } finally {
    submitting.value = false
  }
}
</script>
<template>
  <main class="grid min-h-screen place-items-center bg-muted/40 p-4">
    <section class="w-full max-w-md space-y-5 rounded-xl bg-card p-6 shadow">
      <h1 class="text-2xl font-semibold">Reset password</h1>
      <p v-if="message" role="status">{{ message }}</p>
      <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
      <form v-if="!message" class="space-y-4" @submit.prevent="submit">
        <Input
          v-model="password"
          class="w-full"
          required
          type="password"
          placeholder="New password (at least 8 characters)"
        /><Input
          v-model="confirmation"
          class="w-full"
          required
          type="password"
          placeholder="Confirm new password"
        /><Button type="submit" class="w-full" :disabled="submitting"> Reset password </Button>
      </form>
      <RouterLink to="/login" class="text-sm text-primary">Back to sign in</RouterLink>
    </section>
  </main>
</template>

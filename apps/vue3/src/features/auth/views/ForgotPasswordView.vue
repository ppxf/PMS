<script setup lang="ts">
import { ref } from 'vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
    error.value = e instanceof AppError ? e.message : 'Request failed. Please try again later.'
  } finally {
    submitting.value = false
  }
}
</script>
<template>
  <main class="grid min-h-screen place-items-center bg-muted/40 p-4">
    <section class="w-full max-w-md space-y-5 rounded-xl bg-card p-6 shadow">
      <h1 class="text-2xl font-semibold">Forgot password</h1>
      <p v-if="message" role="status">{{ message }}</p>
      <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
      <form v-if="!message" class="space-y-4" @submit.prevent="submit">
        <Input v-model="email" class="w-full" required type="email" placeholder="Email" /><Button
          type="submit"
          class="w-full"
          :disabled="submitting"
        >
          Send reset email
        </Button>
      </form>
      <RouterLink to="/login" class="text-sm text-primary">Back to sign in</RouterLink>
    </section>
  </main>
</template>

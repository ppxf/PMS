<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { verifyEmail } from '@/features/auth/api/auth.api'
import { AppError } from '@/services/http'
const route = useRoute()
const message = ref('Verifying email…')
const error = ref('')
onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : ''
  if (!token) {
    error.value = 'The verification link is invalid or has expired'
    message.value = ''
    return
  }
  try {
    message.value = (await verifyEmail(token)).message
  } catch (e) {
    message.value = ''
    error.value =
      e instanceof AppError ? e.message : 'The verification link is invalid or has expired'
  }
})
</script>
<template>
  <main class="grid min-h-screen place-items-center bg-muted/40 p-4">
    <section class="w-full max-w-md space-y-5 rounded-xl bg-card p-6 shadow">
      <h1 class="text-2xl font-semibold">Verify email</h1>
      <p v-if="message" role="status">{{ message }}</p>
      <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
      <RouterLink to="/login" class="text-sm text-primary">Go to sign in</RouterLink>
    </section>
  </main>
</template>

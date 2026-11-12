<script setup lang="ts">
import { getInvitationRedirect, rememberInvitationRedirect } from "../model/invitation-redirect"
import { ref } from 'vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { RouterLink, useRoute } from 'vue-router'
const route = useRoute()
rememberInvitationRedirect(route.query.redirect)
const invitationRedirect = getInvitationRedirect()
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
      await register({
        name: name.value,
        email: email.value,
        password: password.value,
        passwordConfirmation: confirmation.value,
      })
    ).message
  } catch (e) {
    error.value = e instanceof AppError ? e.message : 'Registration failed. Please try again later.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="grid min-h-screen place-items-center bg-muted/40 p-4">
    <section class="w-full max-w-md space-y-5 rounded-xl bg-card p-6 shadow">
      <h1 class="page-title">Create account</h1>
      <p v-if="invitationRedirect">Register with the email address that received the project invitation. After verifying your email, sign in to accept it.</p>
      <p v-if="message" role="status">{{ message }}</p>
      <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
      <form v-if="!message" class="space-y-4" @submit.prevent="submit">
        <Input v-model="name" class="w-full" required placeholder="Name" /><Input
          v-model="email"
          class="w-full"
          required
          type="email"
          placeholder="Email"
        /><Input
          v-model="password"
          class="w-full"
          required
          type="password"
          placeholder="Password (at least 8 characters)"
        /><Input
          v-model="confirmation"
          class="w-full"
          required
          type="password"
          placeholder="Confirm password"
        /><Button type="submit" class="w-full" :disabled="submitting">
          {{ submitting ? 'Submitting…' : 'Register' }}
        </Button>
      </form>
      <RouterLink :to="{ path: '/login', query: invitationRedirect ? { redirect: invitationRedirect } : {} }" class="text-sm text-primary">Back to sign in</RouterLink>
    </section>
  </main>
</template>

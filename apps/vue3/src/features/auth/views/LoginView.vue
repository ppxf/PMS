<script setup lang="ts">
import { LockKeyhole } from '@lucide/vue'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { z } from 'zod'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { AppFormField } from '@/components/forms'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { login as loginRequest } from '@/features/auth/api/auth.api'
import { useAuthStore } from '@/features/auth'
import { AppError } from '@/services/http'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const submitError = ref('')

const loginSchema = toTypedSchema(
  z.object({
    email: z.string().email('Enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
)

const { handleSubmit, isSubmitting } = useForm({
  validationSchema: loginSchema,
  initialValues: {
    email: '',
    password: '',
  },
})

function getSafeRedirect(value: unknown): string {
  if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) {
    return value
  }

  return '/'
}

const submit = handleSubmit(async (values) => {
  submitError.value = ''
  try {
    const session = await loginRequest(values)
    auth.login(session)
    await router.replace(getSafeRedirect(route.query.redirect))
  } catch (error) {
    submitError.value =
      error instanceof AppError ? error.message : 'Sign in failed. Please try again later.'
  }
})
</script>

<template>
  <main class="grid min-h-screen place-items-center bg-muted/40 p-4">
    <Card class="w-full max-w-md">
      <CardHeader class="text-center">
        <div
          class="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground"
        >
          <LockKeyhole class="size-6" />
        </div>
        <CardTitle class="text-2xl">Sign in to PMS</CardTitle>
        <CardDescription>Enter your email and password to sign in.</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-5" novalidate @submit="submit">
          <Alert v-if="submitError" variant="destructive" role="alert">
            <AlertDescription>{{ submitError }}</AlertDescription>
          </Alert>
          <AppFormField v-slot="{ componentField }" name="email" label="Email" required>
            <Input
              v-bind="componentField"
              type="email"
              autocomplete="username"
              placeholder="admin@example.com"
            />
          </AppFormField>

          <AppFormField v-slot="{ componentField }" name="password" label="Password" required>
            <Input v-bind="componentField" type="password" autocomplete="current-password" />
          </AppFormField>

          <Button class="w-full" type="submit" :disabled="isSubmitting">
            {{ isSubmitting ? 'Signing in…' : 'Sign in' }}
          </Button>
          <div class="flex justify-between text-sm">
            <RouterLink class="text-primary" to="/register">Create account</RouterLink>
            <RouterLink class="text-primary" to="/forgot-password">Forgot password</RouterLink>
          </div>
        </form>
      </CardContent>
    </Card>
  </main>
</template>

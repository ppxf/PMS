<script setup lang="ts">
import { ShieldX } from '@lucide/vue'
import { useRouter } from 'vue-router'

import { Button } from '@/components/ui/button'

const router = useRouter()
</script>

<template>
  <main class="grid min-h-screen place-items-center bg-muted/30 p-6 text-center">
    <div class="max-w-md space-y-4">
      <ShieldX class="mx-auto size-14 text-destructive" />
      <h1 class="text-3xl font-semibold">Access denied</h1>
      <p class="text-muted-foreground">
        Your account does not have permission to access this page. Contact your administrator.
      </p>
      <Button type="button" @click="router.push({ name: 'dashboard' })"> Back to dashboard </Button>
    </div>
  </main>
</template>

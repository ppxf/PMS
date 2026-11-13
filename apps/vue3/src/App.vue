<script setup lang="ts">
import { Toaster } from '@/components/ui/toast'
import { navigationLoading } from '@/router'
import Loading from '@/components/ui/loading/Loading.vue'
defineOptions({ name: 'App' })
</script>

<template>
  <RouterView />
  <div
    v-if="navigationLoading"
    class="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center border-t-2 border-primary pt-3"
  >
    <div class="rounded-md border bg-background px-4 py-2 shadow-sm">
      <Loading label="Loading page…" />
    </div>
  </div>
  <Toaster />
</template>

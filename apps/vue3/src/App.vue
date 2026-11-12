<script setup lang="ts">
import { Toaster } from '@/components/ui/toast'
defineOptions({ name: 'App' })
</script>

<template>
  <RouterView />
  <Toaster />
</template>

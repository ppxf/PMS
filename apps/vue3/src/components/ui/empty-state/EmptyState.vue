<script setup lang="ts">
import { Search } from '@lucide/vue'

defineProps<{
  title: string
  description?: string
  size?: 'lg'
}>()
</script>

<template>
  <div
    class="flex flex-col items-center justify-center text-center"
    :class="size === 'lg' ? 'gap-4' : 'gap-3'"
  >
    <Search
      aria-hidden="true"
      class="shrink-0 text-muted-foreground"
      :class="size === 'lg' ? 'size-12 opacity-70' : 'size-8'"
      :stroke-width="size === 'lg' ? 1.5 : 2"
    />
    <p :class="size === 'lg' ? 'text-lg' : 'text-sm'">{{ title }}</p>
    <p v-if="description" class="max-w-xs text-xs text-muted-foreground">{{ description }}</p>
    <slot />
  </div>
</template>

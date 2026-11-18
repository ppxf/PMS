<script setup lang="ts">
import { translate } from '@/i18n'

import { LoaderCircle } from '@lucide/vue'

withDefaults(defineProps<{ label?: string }>(), { label: 'Loading…' })
</script>

<template>
  <span role="status" class="inline-flex items-center gap-2 text-sm text-muted-foreground">
    <LoaderCircle class="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
    {{ translate(label) }}
  </span>
</template>

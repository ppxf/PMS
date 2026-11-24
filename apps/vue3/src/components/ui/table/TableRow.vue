<script setup lang="ts">
import { useAttrs, type HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
const attrs = useAttrs()
</script>

<template>
  <tr
    data-slot="table-row"
    :data-clickable="typeof attrs.onClick === 'function' ? 'true' : undefined"
    :class="
      cn(
        'hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors has-aria-expanded:bg-muted/50',
        props.class,
      )
    "
  >
    <slot />
  </tr>
</template>

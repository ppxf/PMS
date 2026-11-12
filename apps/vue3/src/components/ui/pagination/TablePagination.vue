<script setup lang="ts">
import { computed } from 'vue'
import { Button } from '@/components/ui/button'

const props = withDefaults(
  defineProps<{
    page: number
    total: number
    pageSize: number
    unit?: string
    busy?: boolean
    label?: string
    previousLabel?: string
    nextLabel?: string
  }>(),
  {
    unit: 'records',
    label: 'Pagination',
    previousLabel: 'Previous page',
    nextLabel: 'Next page',
  },
)
const emit = defineEmits<{ change: [page: number] }>()
const pages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
</script>

<template>
  <nav class="flex flex-wrap items-center justify-end gap-3 text-sm" :aria-label="label">
    <span class="tabular-nums" aria-current="page">
      {{ total }} {{ unit }} · Page {{ page }} of {{ pages }}
    </span>
    <Button
      type="button"
      variant="outline"
      :aria-label="previousLabel"
      :disabled="busy || page <= 1"
      @click="emit('change', page - 1)"
    >
      Previous
    </Button>
    <Button
      type="button"
      variant="outline"
      :aria-label="nextLabel"
      :disabled="busy || page >= pages"
      @click="emit('change', page + 1)"
    >
      Next
    </Button>
  </nav>
</template>

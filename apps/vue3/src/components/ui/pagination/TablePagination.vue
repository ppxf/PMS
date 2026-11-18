<script setup lang="ts">
import { translate } from '@/i18n'

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
  <nav class="flex flex-wrap items-center justify-end gap-3 text-sm" :aria-label="translate(label)">
    <span class="tabular-nums" aria-current="page">
      {{ total }} {{ translate(unit) }} {{ translate('· Page') }} {{ page }} {{ translate('of') }}
      {{ pages }}
    </span>
    <Button
      type="button"
      variant="outline"
      :aria-label="translate(previousLabel)"
      :disabled="busy || page <= 1"
      @click="emit('change', page - 1)"
    >
      {{ translate('Previous') }}
    </Button>
    <Button
      type="button"
      variant="outline"
      :aria-label="translate(nextLabel)"
      :disabled="busy || page >= pages"
      @click="emit('change', page + 1)"
    >
      {{ translate('Next') }}
    </Button>
  </nav>
</template>

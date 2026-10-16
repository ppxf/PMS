<script setup lang="ts">
import { computed, ref } from 'vue'
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent } from 'reka-ui'
import { ChevronDown } from '@lucide/vue'
import { Input } from '@/components/ui/input'
import { controlStyles, menuStyles, optionStyles } from '@/components/ui/control-styles'
import type { LogField } from '../model/logs'
const props = defineProps<{ modelValue: string; fields: LogField[]; label: string }>()
const emit = defineEmits<{ 'update:modelValue': [string]; change: [string] }>()
const open = ref(false),
  search = ref(''),
  category = ref('All')
const options = computed(() =>
  props.fields.filter(
    (f) =>
      (category.value === 'All' || f.category === category.value) &&
      f.key.toLowerCase().includes(search.value.toLowerCase()),
  ),
)
function choose(key: string) {
  emit('update:modelValue', key)
  emit('change', key)
  open.value = false
}
</script>
<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger
      :aria-label="label"
      :class="controlStyles"
      class="flex w-full items-center justify-between gap-2 text-left"
    >
      <span class="truncate">{{ modelValue || 'Select a field' }}</span
      ><ChevronDown class="size-4 shrink-0" />
    </PopoverTrigger>
    <PopoverPortal
      ><PopoverContent
        :aria-label="label"
        align="start"
        :side-offset="4"
        :class="menuStyles"
        class="w-80 max-w-[calc(100vw-2rem)] p-2"
      >
        <Input v-model="search" :aria-label="`Search ${label}`" placeholder="Search fields…" />
        <div class="my-2 flex gap-1">
          <button
            v-for="tab in ['All', 'Logs', 'Attributes']"
            :key="tab"
            type="button"
            class="rounded px-2 py-1 text-xs"
            :class="category === tab ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'"
            @click="category = tab"
          >
            {{ tab }}
          </button>
        </div>
        <div class="max-h-64 overflow-auto" role="listbox" :aria-label="label">
          <button
            v-for="field in options"
            :key="field.key"
            role="option"
            :aria-selected="modelValue === field.key"
            :data-value="field.key"
            type="button"
            :class="optionStyles"
            @click="choose(field.key)"
          >
            <span class="min-w-0 flex-1 truncate">{{ field.key }}</span
            ><span class="text-xs text-muted-foreground">{{ field.type }}</span>
          </button>
          <p v-if="!options.length" class="p-3 text-sm text-muted-foreground">No matching fields</p>
        </div>
      </PopoverContent></PopoverPortal
    >
  </PopoverRoot>
</template>

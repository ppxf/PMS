<script setup lang="ts" generic="T extends string | number">
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '.'
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
defineOptions({ inheritAttrs: false })
const props = defineProps<{
  modelValue?: T
  options: { value: T; label: string; disabled?: boolean }[]
  placeholder?: string
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: T]; change: [value: T] }>()
// Encode every value so that None is selectable and cannot collide with a real field name.
const encode = (value: string | number) => JSON.stringify(value)
function select(value: unknown) {
  const option = props.options.find((option) => encode(option.value) === value)
  if (!option || option.disabled) return
  emit('update:modelValue', option.value)
  emit('change', option.value)
}
</script>
<template>
  <Select
    :model-value="modelValue === undefined ? '' : encode(modelValue)"
    :disabled="disabled"
    @update:model-value="select"
  >
    <SelectTrigger
      v-bind="{ ...$attrs, class: cn('w-full min-w-0', $attrs.class as HTMLAttributes['class']) }"
      ><SelectValue :placeholder="placeholder"
    /></SelectTrigger>
    <SelectContent>
      <SelectItem
        v-for="option in options"
        :key="encode(option.value)"
        :value="encode(option.value)"
        :data-value="String(option.value)"
        :disabled="option.disabled"
        >{{ option.label }}</SelectItem
      >
    </SelectContent>
  </Select>
</template>

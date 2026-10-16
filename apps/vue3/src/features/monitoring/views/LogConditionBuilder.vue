<script setup lang="ts">
import { computed, ref } from 'vue'
import { X } from '@lucide/vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import FormSelect from '@/components/ui/select/FormSelect.vue'
import LogFieldPicker from './LogFieldPicker.vue'
import { conditionValue } from '../model/logs'
import type { LogCondition, LogField } from '../model/logs'
const props = defineProps<{
  modelValue: LogCondition[]
  fields: LogField[]
  label: string
  compact?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [LogCondition[]]; change: [] }>()
const key = ref('message'),
  operator = ref<LogCondition['operator']>('contains'),
  value = ref(''),
  error = ref('')
const field = computed(() => props.fields.find((f) => f.key === key.value))
const operators = computed(() =>
  [
    ...['eq', 'neq', 'in', 'not_in', 'exists', 'not_exists'],
    ...(['number', 'size', 'mixed'].includes(field.value?.type ?? '')
      ? ['gt', 'gte', 'lt', 'lte']
      : []),
    ...(['string', 'mixed'].includes(field.value?.type ?? '') ? ['contains'] : []),
  ].map((value) => ({ value, label: value })),
)
function setField() {
  operator.value = 'eq'
  value.value = ''
  error.value = ''
}
function update(next: LogCondition[]) {
  emit('update:modelValue', next)
  emit('change')
}
function add() {
  error.value = ''
  if (props.modelValue.length >= 10) {
    error.value = 'Maximum 10 conditions'
    return
  }
  try {
    const parsed = conditionValue(value.value, operator.value, field.value?.type)
    update([
      ...props.modelValue,
      {
        key: key.value,
        operator: operator.value,
        ...(parsed !== undefined ? { value: parsed } : {}),
      },
    ])
    value.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Invalid value'
  }
}
</script>
<template>
  <form class="space-y-3" :aria-label="label" @submit.prevent="add">
    <div
      class="grid gap-2"
      :class="compact ? 'grid-cols-1' : 'sm:grid-cols-[minmax(0,1fr)_100px_minmax(0,1fr)_auto]'"
    >
      <LogFieldPicker v-model="key" :fields="fields" :label="`${label} field`" @change="setField" />
      <FormSelect v-model="operator" :aria-label="`${label} operator`" :options="operators" />
      <Input
        v-if="!['exists', 'not_exists'].includes(operator)"
        v-model="value"
        :aria-label="`${label} value`"
        placeholder="Value / comma-separated values"
        maxlength="1024"
      />
      <span v-else class="text-sm text-muted-foreground self-center">No value needed</span>
      <Button type="submit" variant="outline" :disabled="modelValue.length >= 10"
        >Add condition</Button
      >
    </div>
    <div v-if="modelValue.length" class="flex flex-wrap gap-2">
      <span
        v-for="(condition, index) in modelValue"
        :key="index"
        class="inline-flex max-w-full items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-xs"
      >
        <span class="break-all"
          >{{ condition.key }} {{ condition.operator }}
          {{ condition.value === undefined ? '' : JSON.stringify(condition.value) }}</span
        >
        <button
          type="button"
          :aria-label="`Remove ${label} condition ${index + 1}`"
          @click="update(modelValue.filter((_, i) => i !== index))"
        >
          <X class="size-3" />
        </button>
      </span>
    </div>
    <p v-if="error" role="alert" class="text-xs text-destructive">{{ error }}</p>
  </form>
</template>

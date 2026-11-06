<script setup lang="ts">
import QuerySearchBar from '../components/QuerySearchBar.vue'
import { computed, nextTick, ref } from 'vue'
import { X } from '@lucide/vue'
import { conditionValue } from '../model/logs'
import type { LogCondition, LogField } from '../model/logs'
const props = defineProps<{
  modelValue: LogCondition[]
  fields: LogField[]
  label: string
  compact?: boolean
  suggestions?: Record<string, unknown[]>
}>()
const emit = defineEmits<{ 'update:modelValue': [LogCondition[]]; change: [] }>()
const key = ref('message'),
  operator = ref<LogCondition['operator']>('contains'),
  value = ref(''),
  error = ref('')
const field = computed(() => props.fields.find((f) => f.key === key.value))
function setField() {
  operator.value = 'eq'
  value.value = ''
  error.value = ''
}
function selectQueryField(value: string) {
  key.value = value
  setField()
}
function update(next: LogCondition[]) {
  emit('update:modelValue', next)
  emit('change')
}
async function applyCondition(condition: { field: string; operator: string; value: string }) {
  key.value = condition.field
  await nextTick()
  operator.value = condition.operator as LogCondition['operator']
  value.value = condition.value
  add()
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
  <QuerySearchBar
    :fields="
      fields.map((f) => ({
        ...f,
        operators: [
          'eq',
          'neq',
          'in',
          'not_in',
          'exists',
          'not_exists',
          ...(['number', 'size', 'mixed'].includes(f.type) ? ['gt', 'gte', 'lt', 'lte'] : []),
          ...(['string', 'mixed'].includes(f.type) ? ['contains'] : []),
        ],
      }))
    "
    :active-field="key"
    :label="`${label} search`"
    :compact="compact"
    :suggestions="suggestions"
    @select="selectQueryField"
    @condition="applyCondition"
  >
    <template #conditions>
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
    </template>
  </QuerySearchBar>
  <p v-if="error" role="alert" class="text-xs text-destructive">{{ error }}</p>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, useId, watch } from 'vue'
import { Search, X, ChevronDown } from '@lucide/vue'
const props = defineProps<{
  fields: { key: string; label?: string; type?: string; operators?: readonly string[] }[]
  activeField: string
  label?: string
  compact?: boolean
  existenceValue?: boolean
  suggestions?: Record<string, unknown[]>
}>()
const emit = defineEmits<{
  select: [key: string]
  condition: [condition: { field: string; operator: string; value: string }]
}>()
const root = ref<HTMLElement>(),
  input = ref<HTMLInputElement>(),
  valueInput = ref<HTMLInputElement>()
const open = ref(false),
  search = ref(''),
  stage = ref<'key' | 'operator' | 'value'>('key')
const selected = ref(''),
  operator = ref(''),
  index = ref(0),
  category = ref('All')
const id = useId()
const names: Record<string, string> = {
  eq: 'is',
  neq: 'is not',
  in: 'is one of',
  not_in: 'is not one of',
  contains: 'contains',
  exists: 'exists',
  not_exists: 'does not exist',
  gt: 'greater than',
  gte: 'at least',
  lt: 'less than',
  lte: 'at most',
}
const field = computed(() => props.fields.find((f) => f.key === selected.value))
function group(key: string) {
  return key.includes('web_vital')
    ? 'Web Vitals'
    : key.startsWith('attributes.')
      ? 'Attributes'
      : 'Fields'
}
const categories = computed(() => ['All', ...new Set(props.fields.map((f) => group(f.key)))])
const options = computed(() => {
  if (stage.value === 'key')
    return props.fields
      .filter((f) => category.value === 'All' || group(f.key) === category.value)
      .map((f) => ({ key: f.key, label: f.label || f.key, type: f.type || 'string' }))
      .filter((f) => `${f.key} ${f.label}`.toLowerCase().includes(search.value.toLowerCase()))
  if (stage.value === 'operator')
    return (field.value?.operators ?? ['eq'])
      .map((op) => ({ key: op, label: names[op] || op, type: op }))
      .filter((o) => `${o.label} ${o.key}`.includes(search.value.toLowerCase()))
  const values =
    operator.value === 'exists' || field.value?.type === 'boolean'
      ? ['true', 'false']
      : (props.suggestions?.[selected.value] ?? [])
          .filter((v) => ['string', 'number', 'boolean'].includes(typeof v))
          .map(String)
  const candidates = [...new Set(values)]
    .filter((v) => v.toLowerCase().includes(search.value.toLowerCase()))
    .slice(0, 30)
  if (search.value.trim() && !candidates.includes(search.value)) candidates.unshift(search.value)
  return candidates.map((v) => ({
    key: v,
    label: operator.value === 'exists' ? (v === 'true' ? 'Exists' : 'Missing') : v,
    type: v === search.value ? 'Enter to apply' : 'value',
  }))
})
watch([search, stage, category], () => {
  index.value = 0
})
watch(open, async (visible) => {
  if (visible && stage.value === 'value') {
    await nextTick()
    valueInput.value?.focus()
  }
})
function reset() {
  stage.value = 'key'
  selected.value = ''
  operator.value = ''
  search.value = ''
}
function editKey() {
  reset()
  open.value = true
}
function editOperator() {
  stage.value = 'operator'
  search.value = ''
  open.value = true
}
async function choose(key: string) {
  if (stage.value === 'key') {
    selected.value = key
    emit('select', key)
    stage.value = 'operator'
  } else if (stage.value === 'operator') {
    operator.value = key
    if (key === 'not_exists' || (key === 'exists' && !props.existenceValue)) {
      await commit('')
      return
    }
    stage.value = 'value'
  } else {
    await commit(key)
    return
  }
  search.value = ''
  await nextTick()
  ;(stage.value === 'value' ? valueInput.value : input.value)?.focus()
}
async function commit(value: string) {
  emit('condition', { field: selected.value, operator: operator.value, value })
  reset()
  await nextTick()
  input.value?.focus()
  open.value = false
}
async function back() {
  search.value = ''
  if (stage.value === 'value') stage.value = 'operator'
  else reset()
  open.value = true
  await nextTick()
  input.value?.focus()
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    open.value = false
    return
  }
  if (event.key === 'Backspace' && !search.value && stage.value !== 'key') {
    event.preventDefault()
    void back()
    return
  }
  if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault()
    index.value = open.value
      ? Math.max(
          0,
          Math.min(options.value.length - 1, index.value + (event.key === 'ArrowDown' ? 1 : -1)),
        )
      : 0
    open.value = true
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    open.value = true
    const option = options.value[index.value]
    if (option) void choose(option.key)
  }
}
function outside(event: PointerEvent) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) open.value = false
}
onMounted(() => document.addEventListener('pointerdown', outside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside))
</script>
<template>
  <div
    ref="root"
    class="relative min-w-0 rounded-lg border bg-background focus-within:border-cyan-600 focus-within:ring-2 focus-within:ring-cyan-600/10"
    @keydown.esc="open = false"
  >
    <div class="flex min-h-11 flex-wrap items-center gap-2 px-3 py-2">
      <Search class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <slot name="conditions" />
      <span
        v-if="selected"
        class="inline-flex items-center gap-1 rounded border bg-muted/40 px-2 py-1 text-xs"
      >
        <button type="button" @click="editKey">
          {{ selected }}
        </button>
        <button v-if="operator" type="button" class="text-cyan-700" @click="editOperator">
          {{ names[operator] || operator }}
        </button>
        <button type="button" aria-label="Cancel condition" @click="reset">
          <X class="size-3" />
        </button>
      </span>
      <input
        v-show="stage !== 'value'"
        ref="input"
        v-model="search"
        role="combobox"
        data-query-search
        :aria-label="label || 'Search query fields'"
        :aria-expanded="open"
        :aria-controls="id"
        :aria-activedescendant="open && options[index] ? `${id}-${index}` : undefined"
        aria-autocomplete="list"
        class="min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        :placeholder="
          stage === 'key'
            ? 'Search fields or add a condition…'
            : stage === 'operator'
              ? 'Choose an operator…'
              : 'Type a value and press Enter…'
        "
        @focus="open = true"
        @input="open = true"
        @keydown="keydown"
      />
      <button
        type="button"
        :aria-label="open ? 'Close query editor' : 'Open query editor'"
        class="rounded p-1 text-muted-foreground hover:bg-muted"
        @click="open = !open"
      >
        <ChevronDown class="size-4" />
      </button>
    </div>
    <div
      v-if="open"
      data-query-panel
      class="absolute left-0 top-full z-40 mt-2 w-full max-w-2xl overflow-hidden rounded-lg border bg-background shadow-lg"
    >
      <div v-if="stage === 'key'" class="flex flex-wrap gap-1 border-b bg-muted/30 p-2">
        <button
          v-for="item in categories"
          :key="item"
          type="button"
          class="rounded-md px-3 py-1 text-xs"
          :class="
            category === item ? 'bg-cyan-50 text-cyan-700' : 'text-muted-foreground hover:bg-muted'
          "
          @click="category = item"
        >
          {{ item }}
        </button>
      </div>
      <div
        v-else
        class="flex items-center gap-2 border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <button type="button" class="text-cyan-700" @click="back">← Back</button
        >{{ stage === 'operator' ? 'Choose an operator' : 'Choose or enter a value' }}
      </div>
      <div v-if="stage === 'value'" class="border-b p-3">
        <input
          ref="valueInput"
          v-model="search"
          role="combobox"
          aria-label="Condition value"
          :aria-expanded="open"
          :aria-controls="id"
          :aria-activedescendant="options[index] ? `${id}-${index}` : undefined"
          aria-autocomplete="list"
          class="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/10"
          placeholder="Type a value and press Enter…"
          @keydown="keydown"
        />
      </div>
      <div
        :id="id"
        role="listbox"
        aria-label="Query suggestions"
        class="max-h-72 overflow-y-auto p-1"
      >
        <button
          v-for="(option, i) in options"
          :id="`${id}-${i}`"
          :key="option.key"
          :data-value="option.key"
          type="button"
          role="option"
          :aria-selected="i === index"
          class="flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm"
          :class="i === index ? 'bg-muted' : 'hover:bg-muted/50'"
          @mouseenter="index = i"
          @click="choose(option.key)"
        >
          <span class="break-all">{{ option.label }}</span
          ><span class="shrink-0 text-xs text-cyan-700">{{ option.type }}</span>
        </button>
        <p v-if="!options.length" class="px-3 py-6 text-sm text-muted-foreground">
          {{
            stage === 'value'
              ? 'Type a value above. Use commas for multiple values.'
              : 'No matching options'
          }}
        </p>
      </div>
    </div>
  </div>
</template>

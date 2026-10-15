<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, Check } from '@lucide/vue'
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent } from 'reka-ui'
import { Input } from '@/components/ui/input'
import { controlStyles, menuStyles, optionStyles } from '@/components/ui/control-styles'

const props = defineProps<{
  modelValue: string | string[]
  options: { key: string; label: string; type: string; unit?: string }[]
  label: string
  searchLabel: string
  title?: string
  placeholder?: string
  multiple?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string | string[]] }>()
const search = ref(''),
  open = ref(false)
const selected = computed(() =>
  Array.isArray(props.modelValue) ? props.modelValue : props.modelValue ? [props.modelValue] : [],
)
const visible = computed(() =>
  props.options.filter((option) =>
    option.label.toLowerCase().includes(search.value.trim().toLowerCase()),
  ),
)
const display = computed(
  () =>
    selected.value
      .map((key) => props.options.find((option) => option.key === key)?.label ?? key)
      .join(', ') ||
    props.placeholder ||
    'None',
)
function choose(key: string) {
  if (props.multiple) {
    emit(
      'update:modelValue',
      selected.value.includes(key)
        ? selected.value.filter((value) => value !== key)
        : [...selected.value, key],
    )
  } else {
    emit('update:modelValue', key)
    open.value = false
    search.value = ''
  }
}
function moveFocus(event: KeyboardEvent) {
  if (event.target instanceof HTMLInputElement && ['Home', 'End'].includes(event.key)) return
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const container = event.currentTarget as HTMLElement
  const choices = Array.from(
    container.querySelectorAll<HTMLElement>(
      '[role="option"]:not(:disabled), input[type="checkbox"]:not(:disabled)',
    ),
  )
  if (!choices.length) return
  event.preventDefault()
  const current = choices.indexOf(document.activeElement as HTMLElement)
  const index =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? choices.length - 1
        : event.key === 'ArrowDown'
          ? (current + 1) % choices.length
          : (current <= 0 ? choices.length : current) - 1
  choices[index]?.focus()
}
</script>

<template>
  <PopoverRoot v-model:open="open" @update:open="search = ''">
    <PopoverTrigger as-child>
      <button
        type="button"
        role="combobox"
        :aria-label="label"
        aria-haspopup="dialog"
        :aria-expanded="open"
        :class="[controlStyles, 'flex w-full items-center justify-between gap-2']"
      >
        <span class="min-w-0 truncate">{{ multiple ? 'Group by: ' : '' }}{{ display }}</span>
        <ChevronDown class="size-4 shrink-0 text-muted-foreground" />
      </button>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        data-slot="picker-content"
        align="start"
        :side-offset="4"
        :aria-label="label"
        :class="[
          menuStyles,
          'w-[var(--reka-popover-trigger-width)] min-w-64 max-w-[calc(100vw-2rem)] p-2 max-h-[var(--reka-popover-content-available-height)] overflow-y-auto',
        ]"
        @keydown="moveFocus"
      >
        <p v-if="title" class="px-1 pb-2 text-xs font-semibold">{{ title }}</p>
        <Input
          v-model="search"
          type="search"
          :aria-label="searchLabel"
          placeholder="Search…"
          class="w-full"
        />
        <button
          v-if="multiple"
          type="button"
          :class="[optionStyles, 'mt-1']"
          @click="emit('update:modelValue', [])"
        >
          None · Clear groups
        </button>
        <div
          class="mt-1 max-h-72 overflow-y-auto"
          :role="multiple ? 'group' : 'listbox'"
          :aria-label="label"
        >
          <template v-for="option in visible" :key="option.key">
            <label v-if="multiple" :class="[optionStyles, 'cursor-pointer']">
              <input
                type="checkbox"
                :aria-label="`Group by ${option.label}`"
                :checked="selected.includes(option.key)"
                :disabled="!selected.includes(option.key) && selected.length >= 5"
                @change="choose(option.key)"
              />
              <span class="min-w-0 flex-1 truncate" :title="option.label">{{ option.label }}</span>
              <span
                class="text-xs"
                :class="option.type === 'number' ? 'text-amber-700' : 'text-violet-600'"
                >{{ option.type }}</span
              >
            </label>
            <button
              v-else
              type="button"
              role="option"
              :aria-selected="selected.includes(option.key)"
              :class="[
                optionStyles,
                'relative pr-8',
                selected.includes(option.key) && 'bg-accent text-accent-foreground',
              ]"
              @click="choose(option.key)"
            >
              <Check
                class="absolute right-2 size-4 shrink-0"
                :class="selected.includes(option.key) ? '' : 'invisible'"
              />
              <span class="min-w-0 flex-1 truncate" :title="option.label">{{ option.label }}</span>
              <span class="rounded bg-violet-500/10 px-1.5 text-xs text-violet-600">{{
                option.type
              }}</span>
              <span
                v-if="option.unit && option.unit !== 'none'"
                class="rounded bg-pink-500/10 px-1.5 text-xs text-pink-600"
                >{{ option.unit }}</span
              >
            </button>
          </template>
          <p v-if="!visible.length" class="px-2 py-4 text-sm text-muted-foreground">
            No matching options
          </p>
        </div>
        <p v-if="multiple" class="px-2 pt-2 text-xs text-muted-foreground">
          Select up to 5 group fields
        </p>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<script setup lang="ts">
import { translate } from '@/i18n'

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

defineOptions({ name: 'AppFormField' })

withDefaults(
  defineProps<{
    name: string
    label: string
    description?: string
    required?: boolean
  }>(),
  {
    description: undefined,
    required: false,
  },
)
</script>

<template>
  <FormField v-slot="fieldSlot" :name="name">
    <FormItem>
      <FormLabel>
        {{ translate(label) }}
        <span v-if="required" class="text-destructive" aria-hidden="true">*</span>
      </FormLabel>
      <FormControl>
        <slot v-bind="fieldSlot" />
      </FormControl>
      <FormDescription v-if="description">
        {{ translate(description) }}
      </FormDescription>
      <FormMessage />
    </FormItem>
  </FormField>
</template>

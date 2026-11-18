<script lang="ts" setup>
import { translate } from '@/i18n'
import type { HTMLAttributes } from 'vue'
import { ErrorMessage } from 'vee-validate'
import { toValue } from 'vue'
import { cn } from '@/lib/utils'
import { useFormField } from './useFormField'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

const { name, formMessageId } = useFormField()
</script>

<template>
  <ErrorMessage
    v-slot="{ message }"
    :id="formMessageId"
    data-slot="form-message"
    as="p"
    :name="toValue(name)"
    :class="cn('text-destructive text-sm', props.class)"
    >{{ translate(message) }}</ErrorMessage
  >
</template>

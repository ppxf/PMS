<script setup lang="ts">
import type { PaginationPrevProps } from 'reka-ui'

import type { HTMLAttributes } from 'vue'
import type { ButtonVariants } from '@/components/ui/button'
import { ChevronLeftIcon } from '@lucide/vue'
import { reactiveOmit } from '@vueuse/core'
import { PaginationPrev, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

const props = withDefaults(
  defineProps<
    PaginationPrevProps & {
      size?: ButtonVariants['size']
      class?: HTMLAttributes['class']
    }
  >(),
  {
    size: 'icon-sm',
  },
)

const delegatedProps = reactiveOmit(props, 'class', 'size')
const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <PaginationPrev
    data-slot="pagination-previous"
    aria-label="Previous page"
    :class="cn(buttonVariants({ variant: 'outline', size }), props.class)"
    v-bind="forwarded"
  >
    <slot>
      <ChevronLeftIcon aria-hidden="true" class="cn-rtl-flip" />
    </slot>
  </PaginationPrev>
</template>

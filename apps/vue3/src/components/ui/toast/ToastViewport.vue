<script setup lang="ts">
import { Check, X, Info } from '@lucide/vue'
import { toastMessages, dismissToast } from './toast'
</script>
<template>
  <section
    v-if="toastMessages.length"
    aria-label="Notifications"
    class="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex max-h-[calc(100dvh-2rem)] flex-col gap-3 overflow-y-auto sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[380px]"
  >
    <div
      v-for="message in toastMessages"
      :key="message.id"
      data-toast
      :role="message.kind === 'error' ? 'alert' : 'status'"
      aria-atomic="true"
      class="pointer-events-auto flex gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-lg animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none"
      :class="
        message.kind === 'error'
          ? 'border-red-200 dark:border-red-900'
          : message.kind === 'warning'
            ? 'border-amber-200 dark:border-amber-900'
            : 'border-emerald-200 dark:border-emerald-900'
      "
    >
      <span
        class="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full"
        :class="
          message.kind === 'error'
            ? 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300'
            : message.kind === 'warning'
              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
        "
        ><Check v-if="message.kind === 'success'" class="size-4" aria-hidden="true" /><X
          v-else-if="message.kind === 'error'"
          class="size-4"
          aria-hidden="true" /><Info v-else class="size-4" aria-hidden="true"
      /></span>
      <div class="min-w-0 flex-1">
        <p class="break-words text-sm font-semibold leading-6">{{ message.title }}</p>
        <p
          v-if="message.description"
          class="mt-1 break-words text-xs leading-5 text-muted-foreground"
        >
          {{ message.description }}
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        class="-mr-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        @click="dismissToast(message.id)"
      >
        <X class="size-4" aria-hidden="true" />
      </button>
    </div>
  </section>
</template>

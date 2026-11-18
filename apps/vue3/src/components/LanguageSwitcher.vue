<script setup lang="ts">
import { Languages } from '@lucide/vue'
import { locale, setLocale, translate } from '@/i18n'

function change(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value === 'en' || value === 'zh-CN') setLocale(value)
}
</script>

<template>
  <label
    class="inline-flex shrink-0 items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-sm shadow-sm"
  >
    <Languages class="size-4 text-muted-foreground" aria-hidden="true" />
    <span class="sr-only">{{ translate('Language') }}</span>
    <select
      data-testid="language-switcher"
      :aria-label="translate('Language')"
      :value="locale"
      class="min-w-0 cursor-pointer bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring"
      @change="change"
    >
      <option value="zh-CN" lang="zh-CN">简体中文</option>
      <option value="en" lang="en">English</option>
    </select>
  </label>
</template>

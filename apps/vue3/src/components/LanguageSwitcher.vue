<script setup lang="ts">
import { Languages } from '@lucide/vue'
import { locale, setLocale, translate } from '@/i18n'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

function change(value: unknown) {
  if (value === 'en' || value === 'zh-CN') setLocale(value)
}
</script>

<template>
  <Select :model-value="locale" @update:model-value="change">
    <SelectTrigger
      data-testid="language-switcher"
      :aria-label="translate('Language')"
      size="sm"
      class="min-w-32 shrink-0 gap-2"
    >
      <Languages class="size-4 text-muted-foreground" aria-hidden="true" />
      <SelectValue>{{ locale === 'zh-CN' ? '简体中文' : 'English' }}</SelectValue>
    </SelectTrigger>
    <SelectContent align="end" class="min-w-36">
      <SelectItem value="zh-CN" data-value="zh-CN" lang="zh-CN">简体中文</SelectItem>
      <SelectItem value="en" data-value="en" lang="en">English</SelectItem>
    </SelectContent>
  </Select>
</template>

<script setup lang="ts">
import { ShieldX } from '@lucide/vue'
import { useRouter } from 'vue-router'

import { Button } from '@/components/ui/button'

const router = useRouter()
</script>

<template>
  <main class="grid min-h-screen place-items-center bg-muted/30 p-6 text-center">
    <div class="max-w-md space-y-4">
      <ShieldX class="mx-auto size-14 text-destructive" />
      <h1 class="text-3xl font-semibold">无权访问</h1>
      <p class="text-muted-foreground">当前账号缺少进入此页面所需的权限，请联系管理员。</p>
      <Button type="button" @click="router.push({ name: 'dashboard' })"> 返回工作台 </Button>
    </div>
  </main>
</template>

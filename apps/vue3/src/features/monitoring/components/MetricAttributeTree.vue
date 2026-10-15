<script setup lang="ts">
import { computed } from 'vue'

defineOptions({ name: 'MetricAttributeTree' })
const props = defineProps<{ entries: [string, string | number | boolean][] }>()
const nodes = computed(() => {
  const groups = new Map<string, { key: string; values: (string | number | boolean)[]; children: [string, string | number | boolean][] }>()
  for (const [path, value] of props.entries) {
    const dot = path.indexOf('.')
    const key = dot > 0 ? path.slice(0, dot) : path
    let node = groups.get(key)
    if (!node) {
      node = { key, values: [], children: [] }
      groups.set(key, node)
    }
    if (dot > 0) node.children.push([path.slice(dot + 1), value])
    else node.values.push(value)
  }
  return [...groups.values()]
})
</script>

<template>
  <ul class="space-y-1 font-mono text-xs">
    <li v-for="node in nodes" :key="node.key">
      <div
        v-for="(value, index) in node.values"
        :key="index"
        class="grid grid-cols-[minmax(5rem,1fr)_minmax(0,2fr)] gap-3 rounded bg-muted/50 px-2 py-1"
      >
        <span class="text-muted-foreground [overflow-wrap:anywhere]">{{ node.key }}</span>
        <span class="whitespace-pre-wrap [overflow-wrap:anywhere]">{{ String(value) }}</span>
      </div>
      <details v-if="node.children.length" class="rounded bg-muted/30 px-2 py-1">
        <summary class="cursor-pointer text-muted-foreground">{{ node.key }}</summary>
        <MetricAttributeTree
          :entries="node.children"
          class="mt-1 border-l border-border pl-3"
        />
      </details>
    </li>
  </ul>
</template>

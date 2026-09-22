import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { listGroups } from '../api/monitoring.api'
import type { MonitoringGroup } from './types'

export const useOnboardingStore = defineStore('monitoring-onboarding', () => {
  const groups = ref<MonitoringGroup[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const loadedForUserId = ref<string | null>(null)
  let loadingTask: Promise<void> | null = null

  const needsGroup = computed(() => loaded.value && groups.value.length === 0)

  function load(userId: string | null = null): Promise<void> {
    if (loaded.value && loadedForUserId.value === userId) return Promise.resolve()
    if (loadingTask) return loadingTask

    loading.value = true
    error.value = null
    loadingTask = listGroups()
      .then((result) => {
        groups.value = result
        loaded.value = true
        loadedForUserId.value = userId
      })
      .catch(() => {
        groups.value = []
        loaded.value = false
        error.value = '无法加载组信息，请重试'
      })
      .finally(() => {
        loading.value = false
        loadingTask = null
      })

    return loadingTask
  }

  function addGroup(group: MonitoringGroup): void {
    groups.value.unshift(group)
    loaded.value = true
  }

  function reset(): void {
    groups.value = []
    loaded.value = false
    loadedForUserId.value = null
    error.value = null
  }

  return {
    addGroup,
    error,
    groups,
    load,
    loaded,
    loadedForUserId,
    loading,
    needsGroup,
    reset,
  }
})

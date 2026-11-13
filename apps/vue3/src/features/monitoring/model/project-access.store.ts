import { defineStore } from 'pinia'
import { ref } from 'vue'
import { http } from '@/services/http'
export const projectModules = [
  'issues',
  'traces',
  'metrics',
  'web-vitals',
  'logs',
  'profiles',
] as const
export interface ProjectAccess {
  projectId: string
  role: 'owner' | 'member'
  permissions: string[]
}
export function routePermission(name: string): string | null {
  const module = projectModules.find(
    (module) =>
      name === `project-${module}` ||
      name.startsWith(`project-${module}-`) ||
      (module === 'issues' && name === 'project-issue-detail') ||
      (module === 'profiles' && name === 'project-profile-detail') ||
      (module === 'traces' && name === 'project-trace-detail'),
  )
  return module ? `project:${module}:read` : null
}
export const useProjectAccessStore = defineStore('project-access', () => {
  const access = ref<ProjectAccess | null>(null)
  const key = ref('')
  let generation = 0
  function clear() {
    generation++
    access.value = null
    key.value = ''
  }
  async function load(userId: string, group: string, project: string) {
    const nextKey = `${userId}/${group}/${project}`
    if (key.value !== nextKey) clear()
    const requestGeneration = ++generation
    let value: ProjectAccess
    try {
      value = await http.get<ProjectAccess>(
        `/groups/${encodeURIComponent(group)}/projects/${encodeURIComponent(project)}/access`,
      )
    } catch (error) {
      if (requestGeneration === generation) clear()
      throw error
    }
    if (requestGeneration !== generation) throw new Error('Project access request superseded')
    key.value = `${userId}/${group}/${project}`
    access.value = value
    return value
  }
  function canRoute(name: string) {
    if (!access.value) return false
    if (access.value.role === 'owner') return true
    const permission = routePermission(name)
    return !!permission && !name.includes('setup') && access.value.permissions.includes(permission)
  }
  return { access, key, clear, load, canRoute }
})

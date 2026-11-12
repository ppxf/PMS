import { http } from '@/services/http'

export interface DashboardProject {
  id: string
  name: string
  slug: string
  groupId: string
  groupName: string
  groupSlug: string
  platform: string
  lastSeenAt: string | null
  role: 'owner' | 'member'
  permissions: string[]
  unresolved: number | null
  newIssues: number | null
  events: number | null
  series: number[] | null
}
export interface DashboardIssue {
  id: string
  projectId: string
  title: string
  eventCount: number
  firstSeenAt: string
  lastSeenAt: string
  reopenedAt: string | null
}
export interface DashboardOverview {
  range: '24h' | '7d'
  start: string
  end: string
  groups: { id: string; name: string }[]
  projects: DashboardProject[]
  issues: DashboardIssue[]
  series: { at: string; count: number }[]
  totals: {
    projects: number
    connected: number
    unresolved: number
    events: number
    newIssues: number
  }
}
export const getDashboard = (params: { range: '24h' | '7d'; groupId?: string }) =>
  http.get<DashboardOverview>('/dashboard', { params })

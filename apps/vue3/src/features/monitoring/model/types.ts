export interface MonitoringGroup {
  id: string
  name: string
  slug: string
  projectCount: number
  createdAt: string
  updatedAt: string
}

export interface MonitoringProject {
  id: string
  groupId: string
  name: string
  slug: string
  platform: 'vue'
  errorMonitoringEnabled: boolean
  loggingEnabled: boolean
  tracingEnabled: boolean
  metricsEnabled: boolean
  dsn: string
  connected: boolean
  lastSeenAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateGroupInput {
  name: string
}

export interface CreateProjectInput {
  name: string
  platform: 'vue'
  errorMonitoringEnabled: boolean
  loggingEnabled: boolean
  tracingEnabled: boolean
  metricsEnabled: boolean
}

export interface ProjectConnection {
  connected: boolean
  lastSeenAt: string | null
}

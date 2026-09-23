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

export interface MonitoringIssueSummary {
  id: string
  title: string
  exceptionType: string
  culprit: string | null
  status: 'unresolved'
  eventCount: number
  firstSeenAt: string
  lastSeenAt: string
  environment: string | null
  release: string | null
}

export interface MonitoringEventDetail {
  id: string
  timestamp: string
  receivedAt: string
  source: 'vue' | 'window' | 'unhandledrejection' | 'manual'
  level: 'error'
  message: string
  exceptionType: string
  exceptionValue: string
  stacktrace: string | null
  url: string | null
  environment: string | null
  release: string | null
  tags: Record<string, string>
}

export interface MonitoringIssueDetail extends MonitoringIssueSummary {
  latestEvent: MonitoringEventDetail | null
  recentEvents: MonitoringEventDetail[]
}

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
  status: 'unresolved' | 'resolved'
  eventCount: number
  firstSeenAt: string
  lastSeenAt: string
  source: 'vue' | 'window' | 'unhandledrejection' | 'manual' | null
  environment: string | null
  resolvedAt: string | null
  resolutionReason: 'manual' | 'auto_inactivity' | null
  reopenedAt: string | null
  reopenCount: number
}

export interface BrowserEventContexts {
  request?: { headers: Record<string, string>; cookies: Record<string, string> }
  browser?: { name?: string; version?: string; userAgent?: string }
  os?: { name?: string }
  device?: {
    platform?: string
    screenWidth?: number
    screenHeight?: number
    viewportWidth?: number
    viewportHeight?: number
    pixelRatio?: number
  }
  culture?: { locale?: string; languages?: string[]; timezone?: string }
  memory?: {
    usedJSHeapSize?: number
    totalJSHeapSize?: number
    jsHeapSizeLimit?: number
    deviceMemoryGiB?: number
  }
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
  tags: Record<string, string>
  contexts?: BrowserEventContexts
}

export interface MonitoringIssueDetail extends MonitoringIssueSummary {
  latestEvent: MonitoringEventDetail | null
  recentEvents: MonitoringEventDetail[]
}

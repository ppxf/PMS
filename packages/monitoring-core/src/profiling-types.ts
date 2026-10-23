export interface ProfileFrame {
  name: string
  resourceId?: number
  line?: number
  column?: number
}
export interface ProfileStack {
  frameId: number
  parentId?: number
}
export interface ProfileSample {
  timestamp: number
  stackId?: number
}
export interface MonitoringProfile {
  profileId: string
  startedAt: string
  durationMs: number
  sampleIntervalMs: number
  name: string
  environment?: string
  release?: string
  traceId?: string
  spanId?: string
  truncated: boolean
  resources: string[]
  frames: ProfileFrame[]
  stacks: ProfileStack[]
  samples: ProfileSample[]
}
export interface ProfileEnvelope {
  version: 1
  type: 'profile'
  sentAt: string
  profile: MonitoringProfile
}
export interface ProfileStartOptions {
  name?: string
  traceId?: string
  spanId?: string
}
export interface UIProfiler {
  startProfiler(options?: ProfileStartOptions): void
  stopProfiler(): Promise<void>
}

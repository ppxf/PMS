import type { ProfileSegment } from './profiles'

export interface ProfileDistribution {
  avg: number
  p50: number
  p75: number
  p95: number
  p99: number
}
export interface ProfileFunctionOverview {
  key: string
  name: string
  resource?: string
  line?: number
  column?: number
  profileId: string
  count: number
  self: ProfileDistribution
  total: ProfileDistribution
  baselineSelfP75: number | null
  changePercent: number | null
}
export interface ProfileOverview {
  profileCount: number
  baselineProfileCount: number
  durationMs: number
  unsampledMs: number
  comparisonStart: string
  comparisonEnd: string
  functions: ProfileFunctionOverview[]
  transactions: (ProfileDistribution & { name: string; count: number; profileId: string })[]
  flamegraph: ProfileSegment[]
}

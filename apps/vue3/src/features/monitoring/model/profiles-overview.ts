import type { ProfileSegment } from './profiles'
export const PROFILE_DURATION_AGGREGATIONS = ['avg', 'p50', 'p95'] as const

export interface ProfileDistribution {
  avg: number
  p50: number
  p95: number
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
  baselineSelfP95: number | null
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

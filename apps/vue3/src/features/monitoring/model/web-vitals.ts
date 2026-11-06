export const formatRate = (value: number | null) =>
  value == null ? 'Insufficient data' : `${Math.round(value * 100)}%`
export const vitalThresholds: Record<string, [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
}
export function vitalRating(name: string, value: number | null) {
  if (value == null) return 'Insufficient data'
  const limits = vitalThresholds[name]
  return !limits
    ? 'Unknown'
    : value <= limits[0]
      ? 'Good'
      : value <= limits[1]
        ? 'Needs improvement'
        : 'Poor'
}
export const formatVital = (name: string, value: number | null) =>
  value == null ? '—' : name === 'CLS' ? value.toFixed(3) : `${Math.round(value)} ms`
export interface VitalMetric {
  name: string
  p75: number | null
  count: number
  coverage: number
  good: number
  needsImprovement: number
  poor: number
}
export interface VitalOverview {
  pageViews: number
  completeSamples: number
  passingSamples: number
  passRate: number | null
  coverage: number
  metrics: VitalMetric[]
  lastReceivedAt: string | null
}
export interface VitalPage {
  route: string
  pageViews: number
  metrics: VitalMetric[]
  poorPageViews: number
}
export interface VitalSample {
  pageViewId: string
  startedAt: string
  route: string
  traceId?: string
  spanId?: string
  traceAvailable: boolean
  measurements: { name: string; value: number; attribution?: unknown }[]
}

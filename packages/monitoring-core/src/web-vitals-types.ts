export type WebVitalName = 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB'
export interface WebVitalsPage {
  id: string
  startedAt: string
  route: string
  navigationType: string
  environment?: string
  release?: string
  browser?: string
  device?: 'desktop' | 'mobile' | 'tablet' | 'unknown'
  traceId?: string
  spanId?: string
}
export interface WebVitalMeasurement {
  name: WebVitalName
  metricId: string
  revision: number
  value: number
  observedAt: string
  attribution: Record<string, string | number | boolean>
}
export interface WebVitalsEnvelope {
  version: 1
  type: 'web_vitals'
  eventId: string
  sentAt: string
  page: WebVitalsPage
  measurements: WebVitalMeasurement[]
}

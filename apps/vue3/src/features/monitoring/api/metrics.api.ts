import { http } from '@/services/http'
import type {
  MetricCatalog,
  MetricQuery,
  MetricResult,
  TraceMetricsQuery,
  TraceMetricsResult,
} from '../model/metrics'
const base = (group: string, project: string) =>
  `/groups/${encodeURIComponent(group)}/projects/${encodeURIComponent(project)}/metrics`
export const metricCatalog = (group: string, project: string) =>
  http.get<MetricCatalog>(`${base(group, project)}/catalog`)
export const metricQuery = (group: string, project: string, query: MetricQuery) =>
  http.post<MetricResult, MetricQuery>(`${base(group, project)}/query`, query)
export const traceMetrics = (
  group: string,
  project: string,
  traceId: string,
  query: TraceMetricsQuery,
) =>
  http.get<TraceMetricsResult>(`${base(group, project)}/traces/${encodeURIComponent(traceId)}`, {
    params: query,
  })

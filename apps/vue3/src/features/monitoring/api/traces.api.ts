import { http } from '@/services/http'
import type {
  Span,
  TraceQuery,
  TracePage,
  TraceSample,
  TraceSeries,
  TraceAggregates,
  TraceField,
} from '../model/traces'
const base = (group: string, project: string) =>
  `/groups/${encodeURIComponent(group)}/projects/${encodeURIComponent(project)}`
export const spanSamples = (g: string, p: string, q: TraceQuery) =>
  http.post<TracePage<Span>, TraceQuery>(`${base(g, p)}/spans/samples`, q)
export const traceSamples = (g: string, p: string, q: TraceQuery) =>
  http.post<TracePage<TraceSample>, TraceQuery>(`${base(g, p)}/spans/traces`, q)
export const traceSeries = (g: string, p: string, q: TraceQuery) =>
  http.post<TraceSeries, TraceQuery>(`${base(g, p)}/spans/timeseries`, q)
export const traceAggregates = (g: string, p: string, q: TraceQuery) =>
  http.post<TraceAggregates, TraceQuery>(`${base(g, p)}/spans/aggregates`, q)
export const traceFields = (g: string, p: string) =>
  http.get<TraceField[]>(`${base(g, p)}/spans/fields`)
export const traceDetail = (g: string, p: string, id: string, cursor?: string) =>
  http.get<{ items: Span[]; hasMore: boolean; nextCursor?: string }>(
    `${base(g, p)}/traces/${encodeURIComponent(id)}`,
    { params: cursor ? { cursor } : {} },
  )

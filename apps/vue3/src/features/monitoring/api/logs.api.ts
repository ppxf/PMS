import { http } from '@/services/http'
import type { LogFields, LogQuery, LogResult } from '../model/logs'
const base = (group: string, project: string) =>
  `/groups/${encodeURIComponent(group)}/projects/${encodeURIComponent(project)}/logs`
export const logFields = (group: string, project: string) =>
  http.get<LogFields>(`${base(group, project)}/fields`)
export const logQuery = (group: string, project: string, query: LogQuery) =>
  http.post<LogResult, LogQuery>(`${base(group, project)}/query`, query)

import { http } from '@/services/http'
export const webVitalsQuery = <T>(
  group: string,
  project: string,
  resource: string,
  params: Record<string, unknown>,
  signal?: AbortSignal,
) =>
  http.get<T>(
    `/groups/${encodeURIComponent(group)}/projects/${encodeURIComponent(project)}/web-vitals/${resource}`,
    { params, signal },
  )

import { http } from '@/services/http'
import type { Profile, ProfilePage, ProfileQuery } from '../model/profiles'
import type { MonitoringProject } from '../model/types'
import type { ProfileOverview } from '../model/profiles-overview'
const base = (group: string, project: string) =>
  `/groups/${encodeURIComponent(group)}/projects/${encodeURIComponent(project)}/profiles`
export const queryProfiles = (group: string, project: string, query: ProfileQuery) =>
  http.post<ProfilePage, ProfileQuery>(`${base(group, project)}/query`, query)
export const profilesOverview = (group: string, project: string, query: ProfileQuery) =>
  http.post<ProfileOverview, ProfileQuery>(`${base(group, project)}/overview`, query)
export const profileDetail = (group: string, project: string, id: string) =>
  http.get<Profile>(`${base(group, project)}/${encodeURIComponent(id)}`)
export const profilesConfig = (group: string, project: string) =>
  http.get<{ enabled: boolean; dsn: string }>(`${base(group, project)}/config`)
export const updateProfiles = (group: string, project: string, profilesEnabled: boolean) =>
  http.patch<MonitoringProject & { profilesEnabled: boolean }, { profilesEnabled: boolean }>(
    base(group, project),
    { profilesEnabled },
  )

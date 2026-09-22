import { http } from '@/services/http'
import type {
  CreateGroupInput,
  CreateProjectInput,
  MonitoringGroup,
  MonitoringProject,
  ProjectConnection,
} from '../model/types'

export const createGroup = (input: CreateGroupInput) =>
  http.post<MonitoringGroup, CreateGroupInput>('/groups', input)

export const listGroups = () => http.get<MonitoringGroup[]>('/groups')

export const getGroup = (slug: string) => http.get<MonitoringGroup>(`/groups/${slug}`)

export const createProject = (groupSlug: string, input: CreateProjectInput) =>
  http.post<MonitoringProject, CreateProjectInput>(`/groups/${groupSlug}/projects`, input)

export const listProjects = (groupSlug: string) =>
  http.get<MonitoringProject[]>(`/groups/${groupSlug}/projects`)

export const getProject = (groupSlug: string, projectSlug: string) =>
  http.get<MonitoringProject>(`/groups/${groupSlug}/projects/${projectSlug}`)

export const getProjectConnection = (groupSlug: string, projectSlug: string) =>
  http.get<ProjectConnection>(`/groups/${groupSlug}/projects/${projectSlug}/connection`)

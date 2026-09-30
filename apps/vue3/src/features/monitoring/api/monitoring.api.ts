import { http } from '@/services/http'
import type { PageQuery, PageResult } from '@/services/http'
import type {
  CreateGroupInput,
  CreateProjectInput,
  MonitoringGroup,
  MonitoringIssueDetail,
  MonitoringIssueSummary,
  MonitoringProject,
  ProjectConnection,
  ArchiveIssueInput,
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

export const listProjectIssues = (
  groupSlug: string,
  projectSlug: string,
  query: PageQuery & { search?: string; view?: 'active' | 'archived' },
) =>
  http.get<PageResult<MonitoringIssueSummary>>(
    `/groups/${groupSlug}/projects/${projectSlug}/issues`,
    { params: query },
  )

export const getProjectIssue = (groupSlug: string, projectSlug: string, issueId: string) =>
  http.get<MonitoringIssueDetail>(
    `/groups/${groupSlug}/projects/${projectSlug}/issues/${issueId}`,
  )

export const updateProjectIssueStatus = (
  groupSlug: string,
  projectSlug: string,
  issueId: string,
  status: 'unresolved' | 'resolved',
) =>
  http.patch<MonitoringIssueDetail, { status: 'unresolved' | 'resolved' }>(
    `/groups/${groupSlug}/projects/${projectSlug}/issues/${issueId}/status`,
    { status },
  )

export const archiveProjectIssue = (
  groupSlug: string,
  projectSlug: string,
  issueId: string,
  input: ArchiveIssueInput,
) =>
  http.patch<MonitoringIssueDetail, ArchiveIssueInput>(
    `/groups/${groupSlug}/projects/${projectSlug}/issues/${issueId}/archive`,
    input,
  )

export const restoreProjectIssue = (
  groupSlug: string,
  projectSlug: string,
  issueId: string,
) =>
  http.patch<MonitoringIssueDetail, undefined>(
    `/groups/${groupSlug}/projects/${projectSlug}/issues/${issueId}/restore`,
    undefined,
  )

export const deleteProjectIssue = (
  groupSlug: string,
  projectSlug: string,
  issueId: string,
) => http.delete<void>(`/groups/${groupSlug}/projects/${projectSlug}/issues/${issueId}`)

export const permanentlyDeleteProjectIssue = (
  groupSlug: string,
  projectSlug: string,
  issueId: string,
) => http.delete<void>(
  `/groups/${groupSlug}/projects/${projectSlug}/issues/${issueId}/permanent`,
)

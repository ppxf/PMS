import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, patch, post, remove } = vi.hoisted(() => ({
  get: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  patch: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  post: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  remove: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))

vi.mock('@/services/http', () => ({ http: { get, patch, post, delete: remove } }))

import {
  createGroup,
  createProject,
  getGroup,
  getProject,
  getProjectConnection,
  getProjectIssue,
  listGroups,
  listProjectIssues,
  listProjects,
  updateProjectIssueStatus,
  archiveProjectIssue,
  restoreProjectIssue,
  deleteProjectIssue,
  permanentlyDeleteProjectIssue,
} from '../monitoring.api'

describe('monitoring API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses the group endpoints', async () => {
    post.mockResolvedValue({ id: 'group-1' })
    get.mockResolvedValue([])

    await createGroup({ name: 'Acme' })
    await listGroups()
    await getGroup('acme')

    expect(post).toHaveBeenCalledWith('/groups', { name: 'Acme' })
    expect(get.mock.calls).toEqual([['/groups'], ['/groups/acme']])
  })

  it('uses group-scoped project endpoints', async () => {
    const input = {
      name: 'Frontend',
      platform: 'vue' as const,
      errorMonitoringEnabled: true,
      loggingEnabled: false,
      tracingEnabled: false,
      metricsEnabled: false,
    }
    post.mockResolvedValue({ id: 'project-1' })
    get.mockResolvedValue([])

    await createProject('acme', input)
    await listProjects('acme')
    await getProject('acme', 'frontend')
    await getProjectConnection('acme', 'frontend')

    expect(post).toHaveBeenCalledWith('/groups/acme/projects', input)
    expect(get.mock.calls).toEqual([
      ['/groups/acme/projects'],
      ['/groups/acme/projects/frontend'],
      ['/groups/acme/projects/frontend/connection'],
    ])
  })

  it('uses project-scoped issue endpoints with explicit pagination', async () => {
    get.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 20 })

    await listProjectIssues('team', 'web', { page: 2, pageSize: 20 })
    await getProjectIssue('team', 'web', '00000000-0000-4000-8000-000000000001')

    expect(get).toHaveBeenNthCalledWith(1, '/groups/team/projects/web/issues', {
      params: { page: 2, pageSize: 20 },
    })
    expect(get).toHaveBeenNthCalledWith(
      2,
      '/groups/team/projects/web/issues/00000000-0000-4000-8000-000000000001',
    )
  })

  it('updates an issue status within its project scope', async () => {
    patch.mockResolvedValue({ status: 'resolved' })
    await updateProjectIssueStatus('team', 'web', 'issue-1', 'resolved')
    expect(patch).toHaveBeenCalledWith(
      '/groups/team/projects/web/issues/issue-1/status',
      { status: 'resolved' },
    )
  })

  it('uses archive, restore and delete issue endpoints', async () => {
    patch.mockResolvedValue({ id: 'issue-1' })
    remove.mockResolvedValue(undefined)
    await archiveProjectIssue('team', 'web', 'issue-1', {
      mode: 'until_count', threshold: 100,
    })
    await restoreProjectIssue('team', 'web', 'issue-1')
    await deleteProjectIssue('team', 'web', 'issue-1')
    await permanentlyDeleteProjectIssue('team', 'web', 'issue-1')

    expect(patch).toHaveBeenNthCalledWith(
      1, '/groups/team/projects/web/issues/issue-1/archive',
      { mode: 'until_count', threshold: 100 },
    )
    expect(patch).toHaveBeenNthCalledWith(
      2, '/groups/team/projects/web/issues/issue-1/restore', undefined,
    )
    expect(remove).toHaveBeenNthCalledWith(1, '/groups/team/projects/web/issues/issue-1')
    expect(remove).toHaveBeenNthCalledWith(
      2, '/groups/team/projects/web/issues/issue-1/permanent',
    )
  })
})

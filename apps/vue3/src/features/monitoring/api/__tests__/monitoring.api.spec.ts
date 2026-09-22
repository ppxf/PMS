import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, post } = vi.hoisted(() => ({
  get: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  post: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))

vi.mock('@/services/http', () => ({ http: { get, post } }))

import {
  createGroup,
  createProject,
  getGroup,
  getProject,
  getProjectConnection,
  listGroups,
  listProjects,
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
})

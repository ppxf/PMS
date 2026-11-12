import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
const { get, post, patch } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
vi.mock('@/services/http', () => ({ http: { get, post, patch } }))
import WorkspaceView from '../WorkspaceView.vue'
describe('workspace queries', () => {
  it('loads scoped project choices and submits filters with pagination reset', async () => {
    get.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('/projects')
          ? [{ id: 'p1', name: 'Web', permissions: [], role: 'owner' }]
          : { items: [], total: 0, page: 1, pageSize: 20 },
      ),
    )
    const view = mount(WorkspaceView, {
      props: { section: 'issues' },
      global: { stubs: { RouterLink: true } },
    })
    await flushPromises()
    await view.get('input[aria-label="Search"]').setValue('broken')
    await view.get('form[data-testid="filters"]').trigger('submit')
    await flushPromises()
    expect(get).toHaveBeenLastCalledWith(
      '/workspace/issues',
      expect.objectContaining({ params: expect.objectContaining({ q: 'broken', page: 1 }) }),
    )
    expect(view.text()).toContain('No results')
  })
  it('shows request failures with retry', async () => {
    get.mockRejectedValue(new Error('Access denied'))
    const view = mount(WorkspaceView, {
      props: { section: 'issues' },
      global: { stubs: { RouterLink: true } },
    })
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toContain('Access denied')
    expect(view.text()).toContain('Retry')
  })
})

const project = {
  id: 'p1',
  name: 'Web',
  slug: 'web',
  groupId: 'g1',
  groupName: 'Team',
  groupSlug: 'team',
  role: 'owner',
  permissions: [],
}
function setup(
  section: 'issues' | 'alerts' | 'ingestion' | 'audit',
  items: unknown[] = [],
  role = 'owner',
  permissions: string[] = [],
) {
  get.mockImplementation((url: string) =>
    Promise.resolve(
      url === '/workspace/projects'
        ? [{ ...project, role, permissions }]
        : {
            items: url === '/workspace/alert-rules' ? [] : items,
            total: items.length,
            page: 1,
            pageSize: 20,
          },
    ),
  )
  return mount(WorkspaceView, {
    props: { section },
    global: {
      stubs: {
        RouterLink: { props: ['to'], template: '<a :data-route="JSON.stringify(to)"><slot /></a>' },
      },
    },
  })
}
function button(view: ReturnType<typeof mount>, text: string) {
  return view.findAll('button').find((b) => b.text() === text)!
}
describe('workspace operations', () => {
  it('clears all filters when changing workbench routes', async () => {
    const view = setup('issues')
    await flushPromises()
    await view.findAll('select')[1]!.setValue('g1')
    await view.get('input[type="datetime-local"]').setValue('2026-11-11T10:00')
    await view.get('input[aria-label="Search"]').setValue('old')
    await view.setProps({ section: 'ingestion' })
    await flushPromises()
    expect(get).toHaveBeenLastCalledWith('/workspace/ingestion', {
      params: { page: 1, pageSize: 20 },
    })
  })
  it('creates and edits rules, then acknowledges an alert and reloads', async () => {
    const items = [
      { id: 'a1', projectId: 'p1', issueId: 'i1', title: 'Failed checkout', status: 'open' },
    ]
    const view = setup('alerts', items)
    await flushPromises()
    expect(view.get('a').attributes('data-route')).toContain('project-issue-detail')
    post.mockResolvedValue({})
    patch.mockResolvedValue({})
    await button(view, 'Create rule').trigger('click')
    const form = view.findAll('form')[1]!
    await form.get('input:not([type])').setValue('High errors')
    await form.get('select').setValue('p1')
    await form.findAll('select')[1]!.setValue('error_threshold')
    await form.findAll('input[type="number"]')[0]!.setValue(25)
    await form.trigger('submit')
    await flushPromises()
    expect(post).toHaveBeenCalledWith('/workspace/alert-rules', {
      projectId: 'p1',
      name: 'High errors',
      kind: 'error_threshold',
      threshold: 25,
      windowMinutes: 5,
      enabled: true,
    })
    get.mockImplementation((url: string) =>
      Promise.resolve({
        items:
          url === '/workspace/alert-rules'
            ? [
                {
                  id: 'r1',
                  projectId: 'p1',
                  name: 'High errors',
                  kind: 'error_threshold',
                  threshold: 25,
                  windowMinutes: 5,
                  enabled: true,
                },
              ]
            : items,
        total: 1,
      }),
    )
    await button(view, 'Acknowledge').trigger('click')
    await flushPromises()
    expect(post).toHaveBeenCalledWith('/workspace/alerts/a1/acknowledge')
    await button(view, 'Edit rule').trigger('click')
    const edit = view.findAll('form')[1]!
    await edit.get('input[type="checkbox"]').setValue(false)
    await edit.trigger('submit')
    await flushPromises()
    expect(patch).toHaveBeenCalledWith('/workspace/alert-rules/r1', {
      name: 'High errors',
      kind: 'error_threshold',
      threshold: 25,
      windowMinutes: 5,
      enabled: false,
    })
  })
  it('opens a permitted module for ingestion members instead of setup', async () => {
    const view = setup('ingestion', [{ ...project }], 'member', ['project:logs:read'])
    await flushPromises()
    expect(view.get('a').attributes('data-route')).toContain('project-logs')
    expect(view.get('a').attributes('data-route')).not.toContain('project-setup')
  })
  it('renders audit summary, object identity and response status', async () => {
    const view = setup('audit', [
      {
        id: 'audit1',
        projectId: 'p1',
        action: 'project.updated',
        actorName: 'Alice',
        summary: { changed: ['name'] },
        objectType: 'project',
        objectId: 'p1',
        statusCode: 200,
        requestId: 'req1',
      },
    ])
    await flushPromises()
    expect(view.get('pre').text()).toContain('changed')
    expect(view.text()).toContain('HTTP 200')
    expect(view.text()).toContain('req1')
  })
  it('paginates rules separately', async () => {
    const view = setup('alerts')
    await flushPromises()
    get.mockImplementation(() => Promise.resolve({ items: [], total: 50 }))
    await view.get('form').trigger('submit')
    await flushPromises()
    await view.get('button[aria-label="Next rules"]').trigger('click')
    await flushPromises()
    expect(get).toHaveBeenLastCalledWith('/workspace/alert-rules', {
      params: { projectId: undefined, page: 2, pageSize: 20 },
    })
  })
})

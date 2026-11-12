import { BadRequestException } from '@nestjs/common';
import { WorkspaceService, parseQuery } from './workspace.service';

describe('workspace boundaries', () => {
  it('aggregates ingestion once per authorized signal across the page', async () => {
    const projects = ['one', 'two'].map((id) => ({
      id,
      permissions: ['project:issues:read', 'project:logs:read'],
    }));
    const db = {
      query: jest.fn((sql: string) => Promise.resolve(
        sql.includes('LEFT JOIN project_members')
          ? projects
          : projects.map((p) => ({
              projectId: p.id,
              enabled: true,
              lastSeenAt: new Date(),
            })),
      )),
    };
    const result = await new WorkspaceService(db as never).ingestion(
      'member',
      {},
    );
    expect(result.items).toHaveLength(2);
    expect(result.items[0].signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'issues', status: 'active' }),
        expect.objectContaining({ type: 'logs', status: 'active' }),
      ]),
    );
    expect(db.query).toHaveBeenCalledTimes(3);
  });
  it.each([
    { page: '0' },
    { pageSize: '101' },
    { from: 'yesterday' },
    { projectId: 'x' },
    { from: '2026-02-03T00:00:00Z', to: '2026-02-01T00:00:00Z' },
  ])('rejects invalid filters %j', (q) => {
    expect(() => parseQuery(q)).toThrow(BadRequestException);
  });
  it('does not query issue data when member lacks permission', async () => {
    const db = {
      query: jest
        .fn()
        .mockResolvedValue([
          { id: 'project', permissions: ['project:logs:read'] },
        ]),
    };
    const service = new WorkspaceService(db as never);
    expect(await service.issues('member', {})).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid rule payload before database access', async () => {
    const db = { query: jest.fn() };
    const service = new WorkspaceService(db as never);
    await expect(
      service.createRule('user', {
        projectId: 'x',
        name: 'rule',
        kind: 'new_issue',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });
  it('rejects a project identifier wrapped in an array', async () => {
    const service = new WorkspaceService({ query: jest.fn() } as never);
    await expect(
      service.createRule('user', {
        projectId: ['10000000-0000-4000-8000-000000000001'],
        name: 'rule',
        kind: 'new_issue',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

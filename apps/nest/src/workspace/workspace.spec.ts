import { BadRequestException } from '@nestjs/common';
import { WorkspaceService, parseQuery } from './workspace.service';

describe('workspace boundaries', () => {
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

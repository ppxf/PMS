import { ForbiddenException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
import { TracesService } from './traces.service';

const traceId = 'a'.repeat(32);
const spanId = 'b'.repeat(16);
function fixture(allowed = true) {
  const query = jest.fn<
    Promise<Record<string, unknown>[]>,
    [string, unknown[]?]
  >((sql) => {
    if (sql.includes('FROM monitoring_events'))
      return Promise.resolve([
        {
          span_id: spanId,
          error_count: '7',
          id: 'event',
          issue_id: 'issue',
          timestamp: new Date('2026-11-27T00:00:00Z'),
          message: 'Render failed',
          exception_type: 'TypeError',
        },
      ]);
    if (sql.includes('cursor_time'))
      return Promise.resolve([{ trace_id: traceId, span_id: spanId, status: 'ok' }]);
    return Promise.resolve([]);
  });
  const projects = {
    findReadableBySlug: jest.fn(() => Promise.resolve({ id: 'project' })),
    getAccess: () => Promise.resolve({
      role: 'member',
      permissions: allowed ? ['project:issues:read'] : [],
    }),
  };
  const service = new TracesService(
    {
      transaction: async (
        action: (manager: EntityManager) => Promise<unknown>,
      ) => action({ query } as unknown as EntityManager),
    } as DataSource,
    projects as unknown as MonitoringProjectsService,
  );
  return { query, projects, service };
}

describe('errors associated with trace spans', () => {
  it('includes bounded error summaries and total counts even for an ok span', async () => {
    const f = fixture();
    const result = await f.service.detail('user', 'team', 'web', traceId);
    expect(result.items[0]).toMatchObject({
      spanId,
      status: 'ok',
      errorCount: 7,
      errors: [
        {
          id: 'event',
          issueId: 'issue',
          message: 'Render failed',
          exceptionType: 'TypeError',
          timestamp: '2026-11-27T00:00:00.000Z',
        },
      ],
    });
    const [sql, parameters] = f.query.mock.calls.find(([sql]) =>
      sql.includes('FROM monitoring_events'),
    )!;
    expect(parameters).toEqual(['project', traceId, [spanId]]);
    expect(sql).toContain('project_id = $1');
    expect(sql).toContain("contexts->'trace'->>'traceId' = $2");
    expect(sql).toContain('<= 5');
  });
  it('does not expose errors to users who only have trace permission', async () => {
    const f = fixture(false);
    const result = await f.service.detail('user', 'team', 'web', traceId);
    expect(result.items[0]).not.toHaveProperty('errors');
    expect(result.items[0]).not.toHaveProperty('errorCount');
    expect(
      f.query.mock.calls.some(([sql]) =>
        sql.includes('FROM monitoring_events'),
      ),
    ).toBe(false);
  });
  it('checks trace permission before reading events or spans', async () => {
    const f = fixture();
    f.projects.findReadableBySlug.mockRejectedValue(new ForbiddenException());
    await expect(
      f.service.detail('user', 'team', 'web', traceId),
    ).rejects.toThrow(ForbiddenException);
    expect(f.query).not.toHaveBeenCalled();
  });
});

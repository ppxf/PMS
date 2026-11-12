import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  const now = new Date('2026-11-11T12:00:00Z');
  it('rejects unsupported ranges before reading data', async () => {
    await expect(
      new DashboardService({} as DataSource).overview(
        'user',
        '30d',
        undefined,
        now,
      ),
    ).rejects.toThrow(BadRequestException);
  });
  it('keeps restricted counts unavailable and fills missing buckets with zero', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'p1',
          name: 'Web',
          slug: 'web',
          groupId: 'g',
          groupName: 'Team',
          groupSlug: 'team',
          lastSeenAt: now,
          role: 'owner',
          permissions: ['project:issues:read'],
        },
        {
          id: 'p2',
          name: 'Restricted',
          slug: 'restricted',
          groupId: 'g',
          groupName: 'Team',
          groupSlug: 'team',
          lastSeenAt: null,
          role: 'member',
          permissions: ['project:traces:read'],
        },
      ])
      .mockResolvedValueOnce([
        { projectId: 'p1', unresolved: '2', newIssues: '1' },
      ])
      .mockResolvedValueOnce([{ projectId: 'p1', bucket: '0', count: '3' }])
      .mockResolvedValueOnce([]);
    const result = await new DashboardService({
      query,
    } as unknown as DataSource).overview('user', '24h', undefined, now);
    expect(result.totals).toEqual({
      projects: 2,
      connected: 1,
      unresolved: 2,
      events: 3,
      newIssues: 1,
    });
    expect(result.projects[1]?.unresolved).toBeNull();
    expect(result.projects[1]?.events).toBeNull();
    expect(result.projects[1]?.series).toBeNull();
    expect(result.projects[0]?.series?.[0]).toBe(3);
    expect(result.series).toHaveLength(24);
    expect(result.series[0]).toEqual({
      at: '2026-11-10T12:00:00.000Z',
      count: 3,
    });
    expect(result.series[23]?.count).toBe(0);
    expect(query.mock.calls[1]?.[1]?.[0]).toEqual(['p1']);
  });
  it('returns an empty overview without querying error tables', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const result = await new DashboardService({
      query,
    } as unknown as DataSource).overview('user', '7d', undefined, now);
    expect(result.projects).toEqual([]);
    expect(result.series).toHaveLength(28);
    expect(result.totals.events).toBe(0);
    expect(query).toHaveBeenCalledTimes(1);
  });
});

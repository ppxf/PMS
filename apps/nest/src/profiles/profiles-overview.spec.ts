import { buildProfileOverview } from './profiles-overview';
import { profileEnvelope } from './profiles-test.fixture';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ProfilesService } from './profiles.service';
import { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';

describe('Profiles overview statistics', () => {
  it('aggregates the complete capture, keeps unsampled time, and compares equal function identities', () => {
    const p = profileEnvelope().profile;
    const previous = {
      ...p,
      durationMs: 15,
      samples: [
        { timestamp: 0, stackId: 0 },
        { timestamp: 5, stackId: 1 },
        { timestamp: 10 },
      ],
    };
    const result = buildProfileOverview(
      [p, { ...p, profileId: 'other', durationMs: 50 }],
      [previous],
    );
    expect(result.profileCount).toBe(2);
    expect(result.transactions[0]).toMatchObject({
      name: 'Checkout',
      count: 2,
      p50: 40,
      p75: 45,
      p95: 49,
      p99: 49.8,
    });
    expect(result.functions.find((f) => f.name === 'root')).toMatchObject({
      self: { p75: 10 },
      total: { p75: 20 },
      baselineSelfP75: 5,
      changePercent: 100,
    });
    expect(result.unsampledMs).toBe(40);
    expect(
      result.flamegraph.reduce(
        (sum, s) => (s.depth === 0 ? sum + s.end - s.start : sum),
        0,
      ),
    ).toBe(80);
  });
  it('does not merge different resources, deduplicates recursive inclusive time and has no invented baseline', () => {
    const p = profileEnvelope().profile;
    p.frames = [
      { name: 'root', resourceId: 0 },
      { name: 'root', resourceId: 0 },
    ];
    const other = { ...p, resources: ['other.js'] };
    const result = buildProfileOverview([p, other], []);
    expect(result.functions).toHaveLength(2);
    expect(result.functions[0]).toMatchObject({
      count: 1,
      self: { avg: 20 },
      total: { avg: 20 },
      changePercent: null,
    });
  });
  it('handles empty captures and omits flamegraph children for unsampled intervals', () => {
    expect(buildProfileOverview([], []).functions).toEqual([]);
    const p = { ...profileEnvelope().profile, samples: [] };
    const result = buildProfileOverview([p], []);
    expect(result.functions).toEqual([]);
    expect(result.unsampledMs).toBe(30);
    expect(result.flamegraph).toMatchObject([
      { name: 'Unsampled', depth: 0, start: 0, end: 30 },
    ]);
  });
});

describe('Profiles overview scope', () => {
  const q = {
    start: '2026-10-01T00:00:00Z',
    end: '2026-10-02T00:00:00Z',
    environment: 'production',
    search: "a'b",
    traceId: 'a'.repeat(32),
    page: 1,
    pageSize: 20,
  };
  const query = jest.fn();
  const owned = jest.fn();
  const service = new ProfilesService(
    {
      transaction: jest.fn((_level, run: (m: unknown) => unknown) =>
        run({ query }),
      ),
    } as unknown as DataSource,
    { findOwnedBySlug: owned } as unknown as MonitoringProjectsService,
  );
  beforeEach(() => {
    query.mockReset().mockResolvedValue([]);
    owned.mockReset().mockResolvedValue({ id: 'owned-project' });
  });
  it('binds every filter and loads the previous equal interval in the same snapshot', async () => {
    await service.overview('owner', 'team', 'web', q);
    expect(owned).toHaveBeenCalledWith('owner', 'team', 'web');
    const call = query.mock.calls.find(([sql]: [string]) =>
      sql.includes('SELECT profile'),
    )!;
    expect(call[0]).toContain('project_id = $1');
    expect(call[0]).toContain('sample_count');
    expect(call[0]).not.toContain(q.search);
    expect(call[1]).toEqual([
      'owned-project',
      '2026-09-30T00:00:00.000Z',
      '2026-10-02T00:00:00.000Z',
      q.environment,
      q.search,
      q.traceId,
    ]);
  });
  it('rejects non-owners before reading profiles', async () => {
    owned.mockRejectedValue(new ForbiddenException());
    await expect(
      service.overview('intruder', 'team', 'web', q),
    ).rejects.toThrow(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });
  it('separates current captures and the preceding equal period before computing changes', async () => {
    const profile = profileEnvelope().profile;
    query.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.startsWith('SELECT profile')
          ? [
              { profile: { ...profile, startedAt: q.start } },
              { profile: { ...profile, startedAt: '2026-09-30T12:00:00Z' } },
            ]
          : [],
      ),
    );
    const result = await service.overview('owner', 'team', 'web', q);
    expect(result).toMatchObject({
      profileCount: 1,
      baselineProfileCount: 1,
      comparisonStart: '2026-09-30T00:00:00.000Z',
      comparisonEnd: '2026-10-01T00:00:00.000Z',
    });
    expect(result.functions[0].changePercent).toBe(0);
  });
  it.each([
    { count: '2001' },
    { samples: '2000001' },
    { bytes: String(32 * 1024 * 1024 + 1) },
  ])(
    'rejects over-budget data before fetching full profiles: %j',
    async (size) => {
      query.mockImplementation((sql: string) =>
        Promise.resolve(sql.includes('count(*)') ? [size] : []),
      );
      await expect(service.overview('owner', 'team', 'web', q)).rejects.toThrow(
        'narrow',
      );
      expect(
        query.mock.calls.some(([sql]: [string]) =>
          sql.startsWith('SELECT profile'),
        ),
      ).toBe(false);
    },
  );
  it('rejects excessive ranges and excessive aggregation instead of returning partial statistics', async () => {
    await expect(
      service.overview('owner', 'team', 'web', {
        ...q,
        end: '2027-01-01T00:00:00Z',
      }),
    ).rejects.toThrow(BadRequestException);
    query.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes('SELECT profile')
          ? Array.from({ length: 2001 }, () => ({
              profile: profileEnvelope().profile,
              sampleCount: 1,
            }))
          : [],
      ),
    );
    await expect(service.overview('owner', 'team', 'web', q)).rejects.toThrow(
      'narrow',
    );
  });
});

import { buildProfileOverview } from './profiles-overview';
import { profileEnvelope } from './profiles-test.fixture';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ProfilesService } from './profiles.service';
import { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';

describe('Profiles overview statistics', () => {
  it('ignores Vite timestamps in function and flamegraph identity while retaining raw sources', () => {
    const base = profileEnvelope().profile;
    const capture = (t: string, durationMs: number) => ({
      ...base,
      durationMs,
      resources: [`http://localhost:3002/src/App.vue?t=${t}&vue&type=script`],
      frames: [{ name: 'testFunc', resourceId: 0, line: 10, column: 18 }],
      stacks: [{ frameId: 0 }],
      samples: [{ timestamp: 0, stackId: 0 }],
    });
    const current = capture('1793870267659', 40),
      old = capture('1793870362303', 20);
    const result = buildProfileOverview([current, old], [old]);
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]).toMatchObject({
      count: 2,
      baselineSelfP95: 20,
      resource: current.resources[0],
    });
    expect(result.flamegraph).toHaveLength(1);
    expect(current.resources[0]).toContain('t=1793870267659');
  });
  it('preserves semantic query parameters, distinct locations and non-Vite timestamps', () => {
    const base = profileEnvelope().profile;
    const capture = (resource: string, line = 10) => ({
      ...base,
      resources: [resource],
      frames: [{ name: 'testFunc', resourceId: 0, line, column: 18 }],
      stacks: [{ frameId: 0 }],
      samples: [{ timestamp: 0, stackId: 0 }],
    });
    const result = buildProfileOverview(
      [
        capture('/src/App.vue?t=1793870267659&type=script'),
        capture('/src/App.vue?t=1793870362303&type=template'),
        capture('/src/App.vue?t=1793870267659&type=script', 11),
        capture('/src/App.vue?t=business'),
        capture('/src/App.vue?t=other'),
      ],
      [],
    );
    expect(result.functions).toHaveLength(5);
  });
  it('retains dated current and baseline observations for real function trends', () => {
    const base = profileEnvelope().profile;
    const capture = (startedAt: string, durationMs: number) => ({
      ...base,
      startedAt,
      durationMs,
      samples: [{ timestamp: 0, stackId: 0 }],
    });
    const result = buildProfileOverview(
      [capture('2026-11-05T12:00:00Z', 40)],
      [capture('2026-11-04T12:00:00Z', 20)],
    );
    expect(result.functions[0].series).toEqual([
      { at: '2026-11-04T12:00:00Z', self: 20, total: 20 },
      { at: '2026-11-05T12:00:00Z', self: 40, total: 40 },
    ]);
  });
  it('uses P95 for regression comparison and only returns the shared duration aggregations', () => {
    const base = profileEnvelope().profile;
    const capture = (durationMs: number) => ({
      ...base,
      durationMs,
      samples: [{ timestamp: 0, stackId: 0 }],
    });
    const result = buildProfileOverview(
      [capture(40), capture(60)],
      [capture(10), capture(30)],
    );
    const fn = result.functions[0];
    expect(fn.self).toEqual({ avg: 50, p50: 50, p95: 59 });
    expect(fn.baselineSelfP95).toBe(29);
    expect(fn.changePercent).toBeCloseTo(((59 - 29) / 29) * 100);
    expect(result.transactions[0]).not.toHaveProperty('p75');
    expect(result.transactions[0]).not.toHaveProperty('p99');
  });
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
      p95: 49,
    });
    expect(result.functions.find((f) => f.name === 'root')).toMatchObject({
      self: { p95: 10 },
      total: { p95: 20 },
      baselineSelfP95: 5,
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
    { findReadableBySlug: owned } as unknown as MonitoringProjectsService,
  );
  beforeEach(() => {
    query.mockReset().mockResolvedValue([]);
    owned.mockReset().mockResolvedValue({ id: 'owned-project' });
  });
  it('binds every filter and loads the previous equal interval in the same snapshot', async () => {
    await service.overview('owner', 'team', 'web', q);
    expect(owned).toHaveBeenCalledWith('owner', 'team', 'web', 'project:profiles:read');
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



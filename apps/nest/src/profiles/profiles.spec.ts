/* eslint-disable @typescript-eslint/require-await -- In-memory adapters model asynchronous database calls. */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
import { ProfileEnvelopePipe, ProfileQueryPipe } from './profiles-validation';
import { ProfilesService } from './profiles.service';
import { profileEnvelope, profileQuery } from './profiles-test.fixture';

describe('profiles protocol', () => {
  it('accepts relative samples and missing stacks', () => {
    const input = profileEnvelope();
    expect(new ProfileEnvelopePipe().transform(input)).toEqual(input);
  });
  it.each([
    { stacks: [{ frameId: 2 }] },
    { stacks: [{ frameId: 0, parentId: 0 }] },
    {
      stacks: [
        { frameId: 0, parentId: 1 },
        { frameId: 1, parentId: 0 },
      ],
    },
    { frames: [{ name: 'x', resourceId: 1 }] },
    { samples: [{ timestamp: 0, stackId: 2 }] },
    { samples: [{ timestamp: 10 }, { timestamp: 0 }] },
    { samples: [{ timestamp: 31 }] },
    { samples: [{ timestamp: -1 }] },
    { durationMs: 30001 },
    { sampleIntervalMs: 0 },
    { truncated: 'false' },
    { profileId: 'invalid' },
    { traceId: 'bad' },
    { extra: true },
    { frames: Array.from({ length: 2001 }, () => ({ name: 'x' })) },
    { stacks: Array.from({ length: 5001 }, () => ({ frameId: 0 })) },
    {
      stacks: Array.from({ length: 129 }, (_, index) => ({
        frameId: 0,
        ...(index ? { parentId: index - 1 } : {}),
      })),
    },
    { samples: Array.from({ length: 10001 }, () => ({ timestamp: 0 })) },
    { resources: ['x'.repeat(256 * 1024)] },
  ])('rejects malformed profiles %j', (change) => {
    const input = profileEnvelope();
    Object.assign(input.profile, change);
    expect(() => new ProfileEnvelopePipe().transform(input)).toThrow(
      BadRequestException,
    );
  });
  it('bounds query ranges and pagination and rejects unknown filters', () => {
    expect(new ProfileQueryPipe().transform(profileQuery())).toMatchObject({
      page: 1,
      pageSize: 20,
    });
    for (const change of [
      { page: 0 },
      { pageSize: 101 },
      { traceId: 'bad' },
      { start: new Date(Date.now() - 32 * 86400000).toISOString() },
      { sql: 'anything' },
    ])
      expect(() =>
        new ProfileQueryPipe().transform({ ...profileQuery(), ...change }),
      ).toThrow(BadRequestException);
  });
});

describe('profiles storage and ownership', () => {
  function fixture() {
    const rows = new Map<string, any>();
    const repository = {
      findOneBy: async ({ projectId, profileId }: any) =>
        rows.get(`${projectId}:${profileId}`) ?? null,
      insert: async (row: any) => {
        rows.set(`${row.projectId}:${row.profileId}`, row);
      },
    };
    const manager = {
      getRepository: () => repository,
      query: jest.fn().mockResolvedValue([]),
    };
    const source = {
      transaction: async (...args: any[]) => args.at(-1)(manager),
    };
    const projects = {
      findForIngestion: jest.fn().mockResolvedValue({ profilesEnabled: true }),
      findOwnedBySlug: jest
        .fn()
        .mockImplementation(
          async (user: string, group: string, slug: string) => {
            if (user !== 'owner') throw new ForbiddenException();
            return {
              id: slug,
              profilesEnabled: true,
              dsn: 'https://key@example.test/api/sdk/project',
            };
          },
        ),
    };
    return {
      rows,
      manager,
      projects,
      service: new ProfilesService(
        source as unknown as DataSource,
        projects as unknown as MonitoringProjectsService,
      ),
    };
  }
  it('stores one immutable profile across retries and rejects changed content', async () => {
    const f = fixture(),
      input = profileEnvelope();
    await f.service.ingest('project', 'key', input);
    await f.service.ingest('project', 'key', {
      ...input,
      sentAt: new Date(Date.now() + 1000).toISOString(),
    });
    expect(f.rows.size).toBe(1);
    expect(
      await f.service.detail('owner', 'g', 'project', input.profile.profileId),
    ).toEqual(input.profile);
    input.profile.name = 'Changed';
    await expect(
      f.service.ingest('project', 'key', input),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      (await f.service.detail('owner', 'g', 'project', input.profile.profileId))
        .name,
    ).toBe('Checkout');
  });
  it('rejects disabled projects and isolates detail by owner and project', async () => {
    const f = fixture(),
      input = profileEnvelope();
    f.projects.findForIngestion.mockResolvedValueOnce({
      profilesEnabled: false,
    });
    await expect(
      f.service.ingest('project', 'key', input),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.rows.size).toBe(0);
    await f.service.ingest('project', 'key', input);
    await expect(
      f.service.detail('owner', 'g', 'other', input.profile.profileId),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      f.service.detail('stranger', 'g', 'project', input.profile.profileId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      f.service.query('stranger', 'g', 'project', profileQuery() as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      f.service.config('stranger', 'g', 'project'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(await f.service.config('owner', 'g', 'project')).toEqual({
      enabled: true,
      dsn: 'https://key@example.test/api/sdk/project',
    });
  });
  it('binds search/filter values, scopes by project, and returns stable pages', async () => {
    const f = fixture();
    f.manager.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 21 }])
      .mockResolvedValueOnce([
        {
          profileId: 'result',
          startedAt: new Date('2026-10-23T00:00:00Z'),
          sampleCount: 3,
        },
      ]);
    const result = await f.service.query('owner', 'g', 'project', {
      ...profileQuery(),
      page: 2,
      pageSize: 20,
      search: "%'",
      environment: 'prod',
      traceId: 'a'.repeat(32),
    });
    expect(result).toMatchObject({
      total: 21,
      page: 2,
      pageSize: 20,
      items: [
        {
          profileId: 'result',
          startedAt: '2026-10-23T00:00:00.000Z',
          sampleCount: 3,
        },
      ],
    });
    const [sql, params] = f.manager.query.mock.calls[2];
    expect(sql).toContain('project_id = $1');
    expect(sql).toContain(
      'ORDER BY started_at DESC, profile_id DESC LIMIT 20 OFFSET 20',
    );
    expect(sql).not.toContain("%'");
    expect(params).toEqual(
      expect.arrayContaining(['project', "%'", 'prod', 'a'.repeat(32)]),
    );
  });
});

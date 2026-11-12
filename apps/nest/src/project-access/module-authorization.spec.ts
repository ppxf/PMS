import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { ProjectAccessService } from './project-access.service';
import { ProjectMember } from './project-member.entity';
import { MonitoringProject } from '../monitoring-projects/entities/monitoring-project.entity';
import { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
import { GroupsService } from '../groups/groups.service';
import { TracesService } from '../traces/traces.service';
import { LogsService } from '../logs/logs.service';
import { MetricsService } from '../metrics/metrics.service';
import { ProfilesService } from '../profiles/profiles.service';
import { MonitoringEventsService } from '../monitoring-events/monitoring-events.service';
import { WebVitalsController } from '../web-vitals/web-vitals.controller';
import { ProfileQueryPipe } from '../profiles/profiles-validation';
import { SpanQueryPipe } from '../traces/traces-validation';
import { MetricQueryPipe } from '../metrics/metrics-validation';

function fixture(permissions: string[]) {
  const project = {
    id: 'project-a',
    ownerId: 'owner',
    groupId: 'group',
    slug: 'web',
    name: 'Web',
  } as MonitoringProject;
  let joined = true;
  const repository = {
    find: () => Promise.resolve([project]),
  } as unknown as Repository<MonitoringProject>;
  const members = {
    find: () => Promise.resolve(joined ? [{ projectId: project.id, permissions }] : []),
  } as unknown as Repository<ProjectMember>;
  const access = new ProjectAccessService(repository, members);
  const projects = new MonitoringProjectsService(
    repository,
    {} as GroupsService,
    new ConfigService(),
    access,
  );
  const db = {
    transaction: jest.fn(() => {
      throw new Error('Unauthorized database read');
    }),
    getRepository: jest.fn(() => {
      throw new Error('Unauthorized database read');
    }),
  } as unknown as DataSource;
  return {
    projects,
    db,
    revoke: () => {
      joined = false;
    },
  };
}
const range = () => ({
  start: new Date(Date.now() - 60000).toISOString(),
  end: new Date().toISOString(),
});

describe('module authorization using real project access checks', () => {
  it('lets a traces member read fields, hides Web Vitals fields, and rejects them after removal', async () => {
    const f = fixture(['project:traces:read']);
    const service = new TracesService(f.db, f.projects);
    const fields = await service.fields('member', 'team', 'web');
    expect(fields.some((field) => field.name === 'span.duration')).toBe(true);
    expect(
      fields.some((field) => field.name.startsWith('browser.web_vital.')),
    ).toBe(false);
    f.revoke();
    await expect(
      service.fields('member', 'team', 'web'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('requires the individual module permission before reaching storage', async () => {
    const f = fixture(['project:issues:read']);
    await expect(
      new LogsService(f.db, f.projects).fields('member', 'team', 'web'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      new MetricsService(f.db, f.projects).catalog('member', 'team', 'web'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      new ProfilesService(f.db, f.projects).query(
        'member',
        'team',
        'web',
        new ProfileQueryPipe().transform(range()),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      new WebVitalsController(f.db, f.projects).query(
        { user: { id: 'member' } } as never,
        'team',
        'web',
        'overview',
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      new TracesService(f.db, f.projects).fields('member', 'team', 'web'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks both errors reads without permission and error mutations with read-only permission', async () => {
    const f = fixture(['project:logs:read']);
    const errors = new MonitoringEventsService(f.db, f.projects);
    await expect(
      errors.listOwnedIssues('member', 'team', 'web', {
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const reader = fixture(['project:issues:read']);
    await expect(
      new MonitoringEventsService(reader.db, reader.projects).deleteOwnedIssue(
        'member',
        'team',
        'web',
        'issue-a',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires Web Vitals permission for a Metrics query using its source', async () => {
    const f = fixture(['project:metrics:read']);
    const query = new MetricQueryPipe().transform({
      ...range(),
      source: 'web_vitals',
      name: 'browser.web_vital.lcp.value',
      type: 'distribution',
      unit: 'ms',
      aggregation: 'p75',
    });
    await expect(
      new MetricsService(f.db, f.projects).query(
        'member',
        'team',
        'web',
        query,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires Web Vitals permission for trace aggregation that projects its measurements', async () => {
    const f = fixture(['project:traces:read']);
    const query = new SpanQueryPipe().transform({
      ...range(),
      metrics: [{ function: 'avg', field: 'browser.web_vital.lcp.value' }],
    });
    await expect(
      new TracesService(f.db, f.projects).aggregates(
        'member',
        'team',
        'web',
        query,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

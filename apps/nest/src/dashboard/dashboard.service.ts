import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PROJECT_PERMISSIONS } from '../project-access/project-permissions';

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  groupId: string;
  groupName: string;
  groupSlug: string;
  platform: string;
  lastSeenAt: Date | null;
  role: 'owner' | 'member';
  permissions: string[];
}
interface IssueCounts {
  projectId: string;
  unresolved: string;
  newIssues: string;
}
interface EventBucket {
  projectId: string;
  bucket: string;
  count: string;
}
export interface AttentionIssue {
  id: string;
  projectId: string;
  title: string;
  eventCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  reopenedAt: Date | null;
}

@Injectable()
export class DashboardService {
  constructor(private readonly db: DataSource) {}

  async overview(
    userId: string,
    range = '24h',
    groupId?: string,
    now = new Date(),
  ) {
    if (range !== '24h' && range !== '7d')
      throw new BadRequestException('Unsupported dashboard range');
    if (
      groupId &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        groupId,
      )
    )
      throw new BadRequestException('Invalid group ID');
    const hours = range === '24h' ? 24 : 168;
    const bucketHours = range === '24h' ? 1 : 6;
    const end = now.toISOString();
    const start = new Date(now.getTime() - hours * 3600000).toISOString();
    // Select only presentation fields. Never return public keys, DSNs or origins.
    const accessible = await this.db.query<ProjectRow[]>(
      `
      SELECT p.id, p.name, p.slug, p.platform, p.group_id AS "groupId",
        g.name AS "groupName", g.slug AS "groupSlug", p.last_seen_at AS "lastSeenAt",
        CASE WHEN p.owner_id = $1 THEN 'owner' ELSE 'member' END AS role,
        CASE WHEN p.owner_id = $1 THEN $2::jsonb ELSE m.permissions END AS permissions
      FROM monitoring_projects p JOIN groups g ON g.id = p.group_id
      LEFT JOIN project_members m ON m.project_id = p.id AND m.user_id = $1
      WHERE p.owner_id = $1 OR m.id IS NOT NULL ORDER BY p.name, p.id
    `,
      [userId, JSON.stringify(PROJECT_PERMISSIONS)],
    );
    const groups = [
      ...new Map(
        accessible.map((p) => [
          p.groupId,
          { id: p.groupId, name: p.groupName },
        ]),
      ).values(),
    ];
    const selected = accessible.filter(
      (p) => !groupId || p.groupId === groupId,
    );
    const ids = selected
      .filter((p) => p.permissions.includes('project:issues:read'))
      .map((p) => p.id);
    let counts: IssueCounts[] = [],
      buckets: EventBucket[] = [],
      issues: AttentionIssue[] = [];
    if (ids.length) {
      [counts, buckets, issues] = await Promise.all([
        this.db.query<IssueCounts[]>(
          `
          SELECT project_id AS "projectId",
            COUNT(*) FILTER (WHERE status = 'unresolved' AND visibility = 'active') AS unresolved,
            COUNT(*) FILTER (WHERE first_seen_at >= $2 AND first_seen_at < $3) AS "newIssues"
          FROM monitoring_error_issues WHERE project_id = ANY($1::uuid[]) GROUP BY project_id
        `,
          [ids, start, end],
        ),
        this.db.query<EventBucket[]>(
          `
          SELECT project_id AS "projectId",
            FLOOR(EXTRACT(EPOCH FROM (timestamp - $2::timestamptz)) / $4) AS bucket,
            COUNT(*) AS count FROM monitoring_events
          WHERE project_id = ANY($1::uuid[]) AND timestamp >= $2 AND timestamp < $3
          GROUP BY project_id, bucket
        `,
          [ids, start, end, bucketHours * 3600],
        ),
        this.db.query<AttentionIssue[]>(
          `
          SELECT id, project_id AS "projectId", title, event_count AS "eventCount",
            first_seen_at AS "firstSeenAt", last_seen_at AS "lastSeenAt", reopened_at AS "reopenedAt"
          FROM monitoring_error_issues
          WHERE project_id = ANY($1::uuid[]) AND status = 'unresolved' AND visibility = 'active'
            AND last_seen_at >= $2 AND last_seen_at < $3
          ORDER BY CASE WHEN reopened_at >= $2 THEN 0 WHEN first_seen_at >= $2 THEN 1 ELSE 2 END,
            last_seen_at DESC, id LIMIT 5
        `,
          [ids, start, end],
        ),
      ]);
    }
    const series = Array.from({ length: hours / bucketHours }, (_, i) => ({
      at: new Date(Date.parse(start) + i * bucketHours * 3600000).toISOString(),
      count: 0,
    }));
    const eventTotals = new Map<string, number>();
    const projectSeries = new Map<string, number[]>();
    for (const row of buckets) {
      const point = series[Number(row.bucket)];
      if (point) point.count += Number(row.count);
      eventTotals.set(
        row.projectId,
        (eventTotals.get(row.projectId) ?? 0) + Number(row.count),
      );
      const values = projectSeries.get(row.projectId) ?? series.map(() => 0);
      if (Number(row.bucket) >= 0 && Number(row.bucket) < values.length)
        values[Number(row.bucket)] = Number(row.count);
      projectSeries.set(row.projectId, values);
    }
    const byProject = new Map(counts.map((row) => [row.projectId, row]));
    const projects = selected
      .map((p) => {
        const readable = p.permissions.includes('project:issues:read');
        return {
          ...p,
          unresolved: readable
            ? Number(byProject.get(p.id)?.unresolved ?? 0)
            : null,
          newIssues: readable
            ? Number(byProject.get(p.id)?.newIssues ?? 0)
            : null,
          events: readable ? (eventTotals.get(p.id) ?? 0) : null,
          series: readable
            ? (projectSeries.get(p.id) ?? series.map(() => 0))
            : null,
        };
      })
      .sort(
        (a, b) =>
          (b.unresolved ?? -1) - (a.unresolved ?? -1) ||
          a.name.localeCompare(b.name),
      );
    return {
      range,
      start,
      end,
      groups,
      projects,
      series,
      issues,
      totals: {
        projects: projects.length,
        connected: projects.filter((p) => p.lastSeenAt).length,
        unresolved: projects.reduce((n, p) => n + (p.unresolved ?? 0), 0),
        events: series.reduce((n, p) => n + p.count, 0),
        newIssues: projects.reduce((n, p) => n + (p.newIssues ?? 0), 0),
      },
    };
  }
}

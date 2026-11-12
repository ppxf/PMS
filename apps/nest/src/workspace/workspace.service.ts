import { evaluateAlerts } from './workspace-alert-evaluator';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PROJECT_PERMISSIONS } from '../project-access/project-permissions';

import { Query, parseQuery, uuid } from './workspace-validation';
export { parseQuery } from './workspace-validation';
export interface Row {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  groupId: string;
  groupSlug: string;
  permissions: string[];
  threshold: number;
  windowMinutes: number;
  enabled: boolean;
  lastSeenAt: Date | null;
  [key: string]: unknown;
}

@Injectable()
export class WorkspaceService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private readonly logger = new Logger(WorkspaceService.name);
  constructor(private readonly db: DataSource) {}
  onModuleInit() {
    this.timer = setInterval(() => this.tick(), 30000);
    this.timer.unref();
    this.tick();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
  private tick() {
    if (this.db.isInitialized && !this.running)
      this.running = this.evaluateAlerts()
        .catch((e: unknown) =>
          this.logger.error(
            'Alert evaluation failed',
            e instanceof Error ? e.stack : undefined,
          ),
        )
        .finally(() => {
          this.running = undefined;
        });
  }

  async projects(userId: string) {
    return this.db.query<Row[]>(
      `SELECT p.id,p.name,p.slug,p.group_id AS "groupId",g.name AS "groupName",g.slug AS "groupSlug", CASE WHEN p.owner_id=$1 THEN 'owner' ELSE 'member' END AS role, CASE WHEN p.owner_id=$1 THEN $2::jsonb ELSE m.permissions END AS permissions FROM monitoring_projects p JOIN groups g ON g.id=p.group_id LEFT JOIN project_members m ON m.project_id=p.id AND m.user_id=$1 WHERE p.owner_id=$1 OR m.id IS NOT NULL ORDER BY p.name,p.id`,
      [userId, JSON.stringify(PROJECT_PERMISSIONS)],
    );
  }
  private async selected(userId: string, q: Query, permission?: string) {
    return (await this.projects(userId)).filter(
      (p) =>
        (!q.projectId || p.id === q.projectId) &&
        (!q.groupId || p.groupId === q.groupId) &&
        (!permission || p.permissions.includes(permission)),
    );
  }
  private async list(
    table: string,
    select: string,
    time: string,
    userId: string,
    input: Query,
    permission: string,
    extra?: (q: Query, args: unknown[]) => string,
  ) {
    const q = parseQuery(input),
      projects = await this.selected(userId, q, permission),
      ids = projects.map((p) => p.id);
    if (!ids.length)
      return { items: [], total: 0, page: q.page, pageSize: q.pageSize };
    const args: unknown[] = [ids];
    let where = 'd.project_id=ANY($1::uuid[])';
    for (const [key, op] of [
      ['from', '>='],
      ['to', '<='],
    ] as const)
      if (q[key]) {
        args.push(q[key]);
        where += ` AND d.${time}${op}$${args.length}::timestamptz`;
      }
    if (extra) where += extra(q, args);
    const [{ total }] = await this.db.query<{ total: string }[]>(
      `SELECT count(*) AS total FROM ${table} d WHERE ${where}`,
      args,
    );
    args.push(q.pageSize, (q.page - 1) * q.pageSize);
    const rows = await this.db.query<Row[]>(
      `SELECT ${select} FROM ${table} d WHERE ${where} ORDER BY d.${time} DESC,d.project_id DESC,d.id DESC LIMIT $${args.length - 1} OFFSET $${args.length}`,
      args,
    );
    const map = new Map(projects.map((p) => [p.id, p]));
    return {
      items: rows.map((r) => {
        const p = map.get(r.projectId)!;
        return {
          ...r,
          projectName: p.name,
          projectSlug: p.slug,
          groupSlug: p.groupSlug,
        };
      }),
      total: Number(total),
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  issues(userId: string, q: Query) {
    if (
      q.status !== undefined &&
      !['unresolved', 'resolved'].includes(q.status as string)
    )
      throw new BadRequestException('Invalid status');
    return this.list(
      'monitoring_error_issues',
      'd.id,d.project_id AS "projectId",d.title,d.status,d.environment,d.event_count AS "eventCount",d.first_seen_at AS "firstSeenAt",d.last_seen_at AS "lastSeenAt",d.reopened_at AS "reopenedAt"',
      'last_seen_at',
      userId,
      q,
      'project:issues:read',
      (q, args) => {
        let s = " AND d.visibility='active'";
        for (const key of ['status', 'environment', 'q'])
          if (q[key]) {
            args.push(key === 'q' ? `%${q[key] as string}%` : q[key]);
            s += ` AND d.${key === 'q' ? 'title' : key} ${key === 'q' ? 'ILIKE' : '='} $${args.length}`;
          }
        return s;
      },
    );
  }
  async ingestion(userId: string, input: Query) {
    const q = parseQuery(input),
      projects = await this.selected(userId, q);
    const signals = [
      ['issues', 'error_monitoring_enabled', 'monitoring_events'],
      ['logs', 'logging_enabled', 'monitoring_logs'],
      ['traces', 'tracing_enabled', 'monitoring_spans'],
      ['metrics', 'metrics_enabled', 'monitoring_metrics'],
      ['profiles', 'profiles_enabled', 'monitoring_profiles'],
      ['web-vitals', 'true', 'monitoring_page_views'],
    ];
    const items: Row[] = [];
    for (const p of projects.slice(
      (q.page - 1) * q.pageSize,
      q.page * q.pageSize,
    )) {
      const visible = signals.filter(([type]) =>
        p.permissions.includes(`project:${type}:read`),
      );
      const values = await Promise.all(
        visible.map(async ([type, enabled, table]) => {
          const [r] = await this.db.query<Row[]>(
            `SELECT ${enabled === 'true' ? 'true' : `p.${enabled}`} AS enabled,(SELECT max(received_at) FROM ${table} WHERE project_id=p.id) AS "lastSeenAt" FROM monitoring_projects p WHERE p.id=$1`,
            [p.id],
          );
          return {
            type,
            ...r,
            status: !r.enabled
              ? 'disabled'
              : !r.lastSeenAt
                ? 'waiting'
                : Date.now() - new Date(r.lastSeenAt).getTime() > 86400000
                  ? 'stale'
                  : 'active',
          };
        }),
      );
      items.push({ ...p, signals: values });
    }
    return {
      items,
      total: projects.length,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  private validateRule(body: Query, patch = false) {
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new BadRequestException('Invalid rule');
    if (
      Object.keys(body).some(
        (k) =>
          ![
            'projectId',
            'name',
            'kind',
            'threshold',
            'windowMinutes',
            'enabled',
          ].includes(k),
      )
    )
      throw new BadRequestException('Unknown rule field');
    if (
      (!patch || body.projectId !== undefined) &&
      (typeof body.projectId !== 'string' || !uuid.test(body.projectId))
    )
      throw new BadRequestException('Invalid projectId');
    if (
      (!patch || body.name !== undefined) &&
      (typeof body.name !== 'string' ||
        !body.name.trim() ||
        body.name.length > 128)
    )
      throw new BadRequestException('Invalid name');
    if (
      (!patch || body.kind !== undefined) &&
      !['new_issue', 'reopened_issue', 'error_threshold'].includes(
        body.kind as string,
      )
    )
      throw new BadRequestException('Invalid kind');
    for (const [key, max] of [
      ['threshold', 1000000],
      ['windowMinutes', 10080],
    ] as const)
      if (
        body[key] !== undefined &&
        (!Number.isInteger(body[key]) ||
          Number(body[key]) < 1 ||
          Number(body[key]) > max)
      )
        throw new BadRequestException(`Invalid ${key}`);
    if (body.enabled !== undefined && typeof body.enabled !== 'boolean')
      throw new BadRequestException('Invalid enabled');
  }
  private async owner(userId: string, projectId: string) {
    const [r] = await this.db.query<Row[]>(
      'SELECT id FROM monitoring_projects WHERE id=$1 AND owner_id=$2',
      [projectId, userId],
    );
    if (!r) throw new ForbiddenException('Project owner required');
  }
  rules(userId: string, q: Query) {
    return this.list(
      'workspace_alert_rules',
      'd.id,d.project_id AS "projectId",d.name,d.kind,d.threshold,d.window_minutes AS "windowMinutes",d.enabled,d.created_at AS "createdAt"',
      'created_at',
      userId,
      q,
      'project:issues:read',
    );
  }
  async createRule(userId: string, body: Query) {
    this.validateRule(body);
    await this.owner(userId, body.projectId as string);
    const [r] = await this.db.query<Row[]>(
      `INSERT INTO workspace_alert_rules(project_id,name,kind,threshold,window_minutes,enabled) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [
        body.projectId,
        (body.name as string).trim(),
        body.kind,
        body.threshold ?? 1,
        body.windowMinutes ?? 5,
        body.enabled ?? true,
      ],
    );
    return this.rule(r.id);
  }
  private async rule(id: string) {
    const [r] = await this.db.query<Row[]>(
      'SELECT id,project_id AS "projectId",name,kind,threshold,window_minutes AS "windowMinutes",enabled,created_at AS "createdAt" FROM workspace_alert_rules WHERE id=$1',
      [id],
    );
    return r;
  }
  async updateRule(userId: string, id: string, body: Query) {
    if (!uuid.test(id)) throw new BadRequestException('Invalid rule ID');
    this.validateRule(body, true);
    const r = await this.rule(id);
    if (!r) throw new NotFoundException('Rule not found');
    await this.owner(userId, r.projectId);
    if (body.projectId !== undefined && body.projectId !== r.projectId)
      throw new BadRequestException('Cannot move rule');
    await this.db.query(
      `UPDATE workspace_alert_rules SET name=$2,kind=$3,threshold=$4,window_minutes=$5,enabled=$6 WHERE id=$1`,
      [
        id,
        body.name ?? r.name,
        body.kind ?? r.kind,
        body.threshold ?? r.threshold,
        body.windowMinutes ?? r.windowMinutes,
        body.enabled ?? r.enabled,
      ],
    );
    return this.rule(id);
  }
  alerts(userId: string, q: Query) {
    return this.list(
      'workspace_alerts',
      'd.id,d.project_id AS "projectId",d.rule_id AS "ruleId",d.kind,d.title,d.status,d.issue_id AS "issueId",d.created_at AS "createdAt",d.recovered_at AS "recoveredAt",d.acknowledged_at AS "acknowledgedAt",d.acknowledged_by AS "acknowledgedBy"',
      'created_at',
      userId,
      q,
      'project:issues:read',
    );
  }
  async acknowledge(userId: string, id: string) {
    if (!uuid.test(id)) throw new BadRequestException('Invalid alert ID');
    const projects = await this.selected(userId, {}, 'project:issues:read');
    const [r] = await this.db.query<Row[]>(
      `WITH updated AS (UPDATE workspace_alerts SET acknowledged_at=COALESCE(acknowledged_at,now()),acknowledged_by=COALESCE(acknowledged_by,$2::uuid) WHERE id=$1 AND project_id=ANY($3::uuid[]) RETURNING id,acknowledged_at AS "acknowledgedAt") SELECT * FROM updated`,
      [id, userId, projects.map((p) => p.id)],
    );
    if (!r) throw new NotFoundException('Alert not found');
    return r;
  }
  evaluateAlerts() {
    return evaluateAlerts(this.db);
  }
}

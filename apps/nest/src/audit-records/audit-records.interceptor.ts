import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Observable, catchError, concatMap, from, map, throwError } from 'rxjs';
import { AuditRecordsService } from './audit-records.service';
import { AuditRecord } from './audit-record.entity';
import { auditMetadata, requestIdentifier } from './audit-records.validation';
import { MonitoringProject } from '../monitoring-projects/entities/monitoring-project.entity';
import { PROJECT_PERMISSIONS } from '../project-access/project-permissions';
import { legacyProjectRouteWhere } from '../project-access/project-route-identifier';

@Injectable()
export class AuditRecordsInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AuditRecordsService,
    private readonly db: DataSource,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<{
      method: string;
      route?: { path?: string };
      headers: Record<string, unknown>;
      params: Record<string, string>;
      body?: Record<string, unknown>;
      user?: { id: string; name: string };
      idempotencyReplayed?: boolean;
    }>();
    if (!req.user || !['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method))
      return next.handle();
    const metadata = auditMetadata(req);
    // Only authenticated management controllers; exclude ingestion and authentication payloads.
    const controller = context.getClass().name;
    if (
      ![
        'GroupsController',
        'MonitoringProjectsController',
        'ProjectInvitationsController',
        'ProjectMembersController',
        'MonitoringIssuesController',
        'WorkspaceController',
      ].includes(controller)
    )
      return next.handle();
    const actor = req.user;
    const uuid = (value: unknown): value is string =>
      typeof value === 'string' &&
      /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
    let projectId = uuid(req.body?.projectId) ? req.body.projectId : undefined;
    let ruleBefore: Record<string, unknown> | undefined;
    if (controller === 'WorkspaceController' && uuid(req.params.id)) {
      const table = metadata.action.includes('/alert-rules/')
        ? 'workspace_alert_rules'
        : 'workspace_alerts';
      const columns =
        table === 'workspace_alert_rules'
          ? 'project_id,kind,threshold,window_minutes AS "windowMinutes",enabled'
          : 'project_id';
      const rows: ({ project_id: string } & Record<string, unknown>)[] =
        await this.db.query(`SELECT ${columns} FROM ${table} WHERE id = $1`, [
          req.params.id,
        ]);
      projectId = rows[0]?.project_id;
      if (table === 'workspace_alert_rules') ruleBefore = rows[0];
    }
    let candidates = req.params.projectSlug
      ? await this.db.getRepository(MonitoringProject).find({
          where: {
            ...(uuid(req.params.projectSlug)
              ? { id: req.params.projectSlug }
              : { slug: req.params.projectSlug }),
            group: uuid(req.params.groupSlug)
              ? { id: req.params.groupSlug }
              : { slug: req.params.groupSlug },
          },
          relations: { group: true },
        })
      : projectId
        ? await this.db
            .getRepository(MonitoringProject)
            .find({ where: { id: projectId }, relations: { group: true } })
        : [];
    if (
      !candidates.length &&
      req.params.projectSlug &&
      (uuid(req.params.projectSlug) || uuid(req.params.groupSlug))
    ) {
      const repository = this.db.getRepository(MonitoringProject);
      const legacyWhere = await legacyProjectRouteWhere(
        repository,
        req.params.groupSlug,
        req.params.projectSlug,
      );
      if (legacyWhere)
        candidates = await repository.find({
          where: legacyWhere,
          relations: { group: true },
        });
    }
    const accessible = await Promise.all(
      candidates.map(async (project) => ({
        project,
        allowed:
          project.ownerId === actor.id ||
          Boolean(
            await this.db
              .query(
                'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
                [project.id, actor.id],
              )
              .then((rows: unknown[]) => rows.length),
          ),
      })),
    );
    const allowed = accessible.filter((entry) => entry.allowed);
    const project = allowed.length === 1 ? allowed[0].project : undefined;
    const snapshot: Partial<AuditRecord> = {
      actorId: actor.id,
      actorName: actor.name,
      action: metadata.action,
      requestId: requestIdentifier(metadata.requestId),
      projectId: project?.id ?? null,
      projectName: project?.name ?? null,
      projectOwnerId: project?.ownerId ?? null,
      groupId: project?.groupId ?? null,
      groupName: project?.group?.name ?? null,
      objectType: controller.replace('Controller', ''),
      objectId: null,
      objectName: project?.name ?? null,
    };
    // Route values may be credentials. Only UUID object identifiers are retained.
    for (const key of ['issueId', 'userId', 'id']) {
      const value = req.params[key];
      if (
        typeof value === 'string' &&
        /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)
      ) {
        snapshot.objectId = value;
        break;
      }
    }
    const settings: Record<string, unknown> = {};
    // URL configuration can contain credentials. Audit only the size change.
    for (const key of ['allowedOrigins', 'propagationTargets']) {
      if (Array.isArray(req.body?.[key])) {
        const previous = project
          ? (project as unknown as Record<string, unknown>)[key]
          : undefined;
        settings[`${key}Count`] = {
          before: Array.isArray(previous) ? previous.length : null,
          after: req.body[key].length,
        };
      }
    }
    if (
      controller === 'WorkspaceController' &&
      project &&
      metadata.action.includes('/alert-rules')
    ) {
      for (const key of ['threshold', 'windowMinutes']) {
        if (
          typeof req.body?.[key] === 'number' &&
          Number.isFinite(req.body[key])
        )
          settings[key] = {
            before: ruleBefore?.[key] ?? null,
            after: req.body[key],
          };
      }
      if (
        ['new_issue', 'reopened_issue', 'error_threshold'].includes(
          String(req.body?.kind),
        )
      )
        settings.kind = {
          before: ruleBefore?.kind ?? null,
          after: req.body?.kind,
        };
    }
    if (
      controller === 'MonitoringIssuesController' &&
      project &&
      uuid(req.params.issueId)
    ) {
      const rows: {
        status: string;
        visibility: string;
        archive_threshold: number | null;
      }[] = await this.db.query(
        'SELECT status, visibility, archive_threshold FROM monitoring_error_issues WHERE id = $1 AND project_id = $2',
        [req.params.issueId, project.id],
      );
      const before = rows[0];
      if (before) {
        if (['resolved', 'unresolved'].includes(String(req.body?.status)))
          settings.status = { before: before.status, after: req.body?.status };
        if (metadata.action.endsWith('/restore'))
          settings.visibility = { before: before.visibility, after: 'active' };
        if (['permanent', 'until_count'].includes(String(req.body?.mode))) {
          settings.visibility = {
            before: before.visibility,
            after:
              req.body?.mode === 'permanent'
                ? 'archived_permanent'
                : 'archived_until_count',
          };
          if ([10, 100, 1000].includes(Number(req.body?.threshold)))
            settings.archiveThreshold = {
              before: before.archive_threshold,
              after: req.body?.threshold,
            };
        }
      }
    }
    for (const key of [
      'errorMonitoringEnabled',
      'loggingEnabled',
      'tracingEnabled',
      'metricsEnabled',
      'profilesEnabled',
      'enabled',
    ]) {
      if (typeof req.body?.[key] === 'boolean')
        settings[key] = {
          before:
            key === 'enabled' && ruleBefore
              ? ruleBefore.enabled
              : project
                ? (project as unknown as Record<string, unknown>)[key]
                : undefined,
          after: req.body[key],
        };
    }
    if (Array.isArray(req.body?.permissions))
      settings.permissions = req.body.permissions.filter(
        (value): value is string =>
          typeof value === 'string' &&
          (PROJECT_PERMISSIONS as readonly string[]).includes(value),
      );
    const persist = async (
      result: 'success' | 'failure',
      statusCode: number,
      response?: unknown,
    ) => {
      if (req.idempotencyReplayed) return;
      const created =
        response && typeof response === 'object'
          ? (response as Record<string, unknown>)
          : undefined;
      if (
        !project &&
        result === 'success' &&
        controller === 'MonitoringProjectsController' &&
        typeof created?.id === 'string'
      ) {
        snapshot.projectId = created.id;
        snapshot.projectName =
          typeof created.name === 'string' ? created.name : null;
        snapshot.projectOwnerId = actor.id;
        snapshot.objectName = snapshot.projectName;
        if (uuid(created.id)) {
          const persisted = await this.db
            .getRepository(MonitoringProject)
            .find({
              where: { id: created.id, ownerId: actor.id },
              relations: { group: true },
            });
          if (persisted.length === 1) {
            snapshot.groupId = persisted[0].groupId;
            snapshot.groupName = persisted[0].group?.name ?? null;
          }
        }
      }
      if (
        !project &&
        result === 'success' &&
        controller === 'ProjectInvitationsController' &&
        typeof created?.groupSlug === 'string' &&
        typeof created?.projectSlug === 'string'
      ) {
        const accepted = await this.db.getRepository(MonitoringProject).find({
          where: {
            ...(uuid(created.projectId)
              ? { id: created.projectId }
              : { slug: created.projectSlug }),
            group: uuid(created.groupId)
              ? { id: created.groupId }
              : { slug: created.groupSlug },
          },
          relations: { group: true },
        });
        // Successful acceptance has created a membership. Recheck it and only
        // persist an unambiguous accessible project snapshot.
        const matches: MonitoringProject[] = [];
        for (const candidate of accepted) {
          const rows: unknown[] = await this.db.query(
            'SELECT 1 FROM project_members WHERE project_id=$1 AND user_id=$2',
            [candidate.id, actor.id],
          );
          if (candidate.ownerId === actor.id || rows.length)
            matches.push(candidate);
        }
        if (matches.length === 1)
          Object.assign(snapshot, {
            projectId: matches[0].id,
            projectName: matches[0].name,
            projectOwnerId: matches[0].ownerId,
            groupId: matches[0].groupId,
            groupName: matches[0].group.name,
          });
      }
      if (
        result === 'success' &&
        controller === 'GroupsController' &&
        uuid(created?.id)
      ) {
        snapshot.groupId = created.id;
        snapshot.groupName =
          typeof created.name === 'string' ? created.name : null;
        snapshot.objectName = snapshot.groupName;
      }
      if (
        !snapshot.objectId &&
        typeof created?.id === 'string' &&
        /^[\da-f-]{36}$/i.test(created.id)
      )
        snapshot.objectId = created.id;
      return this.audit.record({
        ...snapshot,
        result,
        statusCode,
        summary: result === 'success' ? settings : {},
      });
    };
    return next.handle().pipe(
      catchError((error: unknown) =>
        from(
          persist(
            'failure',
            error instanceof HttpException ? error.getStatus() : 500,
          ),
        ).pipe(concatMap(() => throwError(() => error))),
      ),
      concatMap((response: unknown) =>
        from(
          persist(
            'success',
            context.switchToHttp().getResponse<{ statusCode: number }>()
              .statusCode,
            response,
          ),
        ).pipe(map(() => response)),
      ),
    );
  }
}

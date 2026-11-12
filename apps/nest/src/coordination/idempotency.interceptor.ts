import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  catchError,
  concatMap,
  defer,
  finalize,
  Observable,
  of,
  throwError,
} from 'rxjs';
import { DataSource } from 'typeorm';
import { ProjectAccessService } from '../project-access/project-access.service';
import { GroupsService } from '../groups/groups.service';
import { CoordinationService, digest } from './coordination.service';

function canonical(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
    .join(',')}}`;
}
type ManagedRequest = Request & {
  user?: { id: string };
  idempotencyReplayed?: boolean;
};

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly store: CoordinationService,
    private readonly access: ProjectAccessService,
    private readonly groups: GroupsService,
    private readonly db: DataSource,
  ) {}
  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<ManagedRequest>();
    const controller = context.getClass().name;
    // Authentication tokens and public ingestion are never response-cached.
    if (
      !req.user ||
      !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ||
      ![
        'GroupsController',
        'MonitoringProjectsController',
        'ProjectMembersController',
        'MonitoringIssuesController',
        'WorkspaceController',
      ].includes(controller)
    )
      return next.handle();
    const key = req.headers['idempotency-key'];
    if (key === undefined) return next.handle();
    if (typeof key !== 'string' || !/^[A-Za-z0-9_.:-]{8,128}$/.test(key))
      throw new BadRequestException('Invalid Idempotency-Key');
    // Controller-level authorization is normally downstream of interceptors. Repeat it
    // here so a cached result cannot survive removal of a project permission.
    await this.authorize(req, controller);
    const scope = JSON.stringify([
      req.user.id,
      req.method,
      req.originalUrl,
      key,
    ]);
    const entry = await this.store.begin(scope, digest(canonical(req.body)));
    const res = context.switchToHttp().getResponse<Response>();
    if (entry.state === 'conflict')
      throw new ConflictException(
        'Idempotency-Key was used for a different request',
      );
    if (entry.state === 'pending') {
      res.setHeader('Retry-After', '1');
      throw new ConflictException('Request is already processing');
    }
    if (entry.state === 'done') {
      req.idempotencyReplayed = true;
      res.statusCode = entry.response.status;
      res.setHeader('Idempotency-Replayed', 'true');
      return of(entry.response.body);
    }
    const token = entry.token;
    let lost = false;
    let writing = false;
    let renewRunning = false;
    const heartbeat = setInterval(() => {
      if (renewRunning) return;
      renewRunning = true;
      void this.store
        .renew(scope, token)
        .then((ok) => {
          if (!ok) lost = true;
        })
        .catch(() => {
          lost = true;
        })
        .finally(() => {
          renewRunning = false;
        });
    }, 15000);
    heartbeat.unref();
    return defer(() => next.handle()).pipe(
      concatMap(async (body: unknown) => {
        // Do not discard a completed write on a Redis failure: keep its pending lease
        // rather than making the next retry execute immediately.
        writing = true;
        if (lost)
          throw new ServiceUnavailableException('Idempotency lease lost');
        await this.store.complete(scope, token, {
          status: res.statusCode,
          body,
        });
        return body;
      }),
      catchError((error: unknown) =>
        defer(async () => {
          if (!writing)
            await this.store.release(scope, token).catch(() => false);
        }).pipe(concatMap(() => throwError(() => error))),
      ),
      finalize(() => clearInterval(heartbeat)),
    );
  }
  private async authorize(req: ManagedRequest, controller: string) {
    const userId = req.user!.id;
    const group = req.params.groupSlug;
    const project = req.params.projectSlug;
    if (typeof group === 'string' && typeof project === 'string') {
      await this.access.requireOwner(userId, group, project);
      return;
    }
    if (typeof group === 'string') {
      await this.groups.findOwnedBySlug(userId, group);
      return;
    }
    if (controller !== 'WorkspaceController') return;
    const id = req.params.id;
    let projectId: unknown = req.body?.projectId;
    const acknowledge = req.path.replace(/\/+$/, '').endsWith('/acknowledge');
    if (id) {
      if (
        typeof id !== 'string' ||
        !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)
      )
        throw new BadRequestException('Invalid resource ID');
      const table = acknowledge ? 'workspace_alerts' : 'workspace_alert_rules';
      const rows: { project_id: string }[] = await this.db.query(
        `SELECT project_id FROM ${table} WHERE id=$1`,
        [id],
      );
      projectId = rows[0]?.project_id;
    }
    if (
      typeof projectId !== 'string' ||
      !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
        projectId,
      )
    )
      throw new ForbiddenException('Project access required');
    const rows: unknown[] = await this.db.query(
      `SELECT p.id FROM monitoring_projects p LEFT JOIN project_members m ON m.project_id=p.id AND m.user_id=$2 WHERE p.id=$1 AND (p.owner_id=$2 ${acknowledge ? `OR m.permissions @> '["project:issues:read"]'::jsonb` : ''})`,
      [projectId, userId],
    );
    if (!rows.length) throw new ForbiddenException('Project access required');
  }
}

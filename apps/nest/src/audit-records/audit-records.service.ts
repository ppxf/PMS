import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';
import { AuditRecord } from './audit-record.entity';
import { parseAuditQuery } from './audit-records.validation';

@Injectable()
export class AuditRecordsService {
  constructor(
    @InjectRepository(AuditRecord)
    private readonly records: Repository<AuditRecord>,
    private readonly db: DataSource,
  ) {}

  record(input: Partial<AuditRecord>) {
    return this.records.save(this.records.create(input));
  }

  async capabilities(userId: string) {
    const rows: { canRead: boolean }[] = await this.db.query(
      `SELECT EXISTS (
      SELECT 1 FROM monitoring_projects WHERE owner_id = $1
      UNION ALL SELECT 1 FROM project_members WHERE user_id = $1 AND permissions @> '["project:audit:read"]'::jsonb
      UNION ALL SELECT 1 FROM audit_records WHERE project_owner_id = $1 OR (project_id IS NULL AND actor_id = $1)
    ) AS "canRead"`,
      [userId],
    );
    return { canRead: rows[0]?.canRead === true };
  }

  async resolveInactiveProductionIssues(
    now: Date,
    cutoff: Date,
  ): Promise<number> {
    // One statement makes resolution and durable audit insertion atomic; only rows
    // actually changed by this scan are emitted, even under overlapping scans.
    const rows: { count: string }[] = await this.db.query(
      `WITH resolved AS (
      UPDATE monitoring_error_issues SET status = 'resolved', resolved_at = $1,
        resolution_reason = 'auto_inactivity', updated_at = $1
      WHERE status = 'unresolved' AND environment = 'production' AND last_seen_at <= $2
      RETURNING id, project_id
    ), inserted AS (
      INSERT INTO audit_records(actor_id, actor_name, project_id, project_name, project_owner_id,
        group_id, group_name, object_type, object_id, action, result, status_code, request_id, summary)
      SELECT NULL, 'system', p.id, p.name, p.owner_id, g.id, g.name, 'issue', r.id::text,
        'issue.auto_resolve', 'success', 200, uuid_generate_v4()::text,
        '{"status":{"before":"unresolved","after":"resolved"},"reason":"auto_inactivity"}'::jsonb
      FROM resolved r JOIN monitoring_projects p ON p.id = r.project_id JOIN groups g ON g.id = p.group_id
      RETURNING id
    ) SELECT count(*)::text AS count FROM inserted`,
      [now, cutoff],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async list(userId: string, query: Record<string, unknown>) {
    const filter = parseAuditQuery(query);
    const qb = this.records.createQueryBuilder('audit');
    qb.where(
      new Brackets((access) => {
        access
          .where('audit.project_owner_id = :userId')
          .orWhere(
            'EXISTS (SELECT 1 FROM monitoring_projects p WHERE p.id = audit.project_id AND p.owner_id = :userId)',
          )
          .orWhere(
            `EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = audit.project_id AND m.user_id = :userId AND m.permissions @> :permission::jsonb)`,
          )
          .orWhere('audit.project_id IS NULL AND audit.actor_id = :userId');
      }),
      { userId, permission: JSON.stringify(['project:audit:read']) },
    );
    if (filter.projectId)
      qb.andWhere('audit.project_id = :projectId', {
        projectId: filter.projectId,
      });
    if (filter.action)
      qb.andWhere('audit.action = :action', { action: filter.action });
    if (filter.actor)
      qb.andWhere(
        '(CAST(audit.actor_id AS text) = :actor OR audit.actor_name = :actor)',
        { actor: filter.actor },
      );
    if (filter.from)
      qb.andWhere('audit.created_at >= :from', { from: new Date(filter.from) });
    if (filter.to)
      qb.andWhere('audit.created_at <= :to', { to: new Date(filter.to) });
    const [items, total] = await qb
      .orderBy('audit.createdAt', 'DESC')
      .addOrderBy('audit.id', 'DESC')
      .skip((filter.page - 1) * filter.pageSize)
      .take(filter.pageSize)
      .getManyAndCount();
    return { items, total, page: filter.page, pageSize: filter.pageSize };
  }
}

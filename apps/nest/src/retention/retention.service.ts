import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { MONITORING_RETENTION_DAYS } from './retention.constants';
export { MONITORING_RETENTION_DAYS } from './retention.constants';
// Parent page views cascade to metrics. Latest issue evidence stays available even when older than the window.
export const RETENTION_TABLES = [
  'monitoring_events',
  'monitoring_logs',
  'monitoring_log_batches',
  'monitoring_metrics',
  'monitoring_metric_batches',
  'monitoring_profiles',
  'monitoring_spans',
  'monitoring_trace_ingest_batches',
  'monitoring_web_vitals',
  'monitoring_page_views',
] as const;
const eligible = (table: string) =>
  `d.received_at < $1${table === 'monitoring_events' ? ' AND NOT EXISTS (SELECT 1 FROM monitoring_error_issues i WHERE i.latest_event_id=d.id)' : table === 'monitoring_page_views' ? ' AND NOT EXISTS (SELECT 1 FROM monitoring_web_vitals w WHERE w.project_id=d.project_id AND w.page_view_id=d.id AND w.received_at >= $1)' : ''}`;

export async function cleanupTable(
  db: DataSource,
  table: string,
  cutoff: Date,
  batchSize = 5000,
): Promise<number> {
  if (!(RETENTION_TABLES as readonly string[]).includes(table))
    throw new Error('Unknown retention table');
  let deleted = 0;
  for (;;) {
    let count: number;
    if (table === 'monitoring_page_views') {
      count = await db.transaction(async (manager) => {
        const candidates: { projectId: string; id: string }[] =
          await manager.query(
            `SELECT d.project_id AS "projectId",d.id FROM monitoring_page_views d WHERE ${eligible(table)} LIMIT $2 FOR UPDATE SKIP LOCKED`,
            [cutoff, batchSize],
          );
        if (!candidates.length) return 0;
        // Ingestion acquires this same per-page advisory lock before changing a revision.
        // Try-lock avoids reverse-order waits with ingestion and allows another scheduled pass to retry busy pages.
        const locked: { projectId: string; id: string; locked: boolean }[] =
          await manager.query(
            `SELECT p."projectId",p.id,pg_try_advisory_xact_lock(hashtextextended('vitals:'||p."projectId"::text||':'||p.id::text,0)) AS locked FROM jsonb_to_recordset($1::jsonb) AS p("projectId" uuid,id uuid)`,
            [JSON.stringify(candidates)],
          );
        const pages = locked
          .filter((p) => p.locked)
          .map(({ projectId, id }) => ({ projectId, id }));
        if (!pages.length) return 0;
        // A fresh statement snapshot rechecks child timestamps after the advisory lock is acquired.
        const [row]: { count: string }[] = await manager.query(
          `WITH removed AS (DELETE FROM monitoring_page_views d USING jsonb_to_recordset($2::jsonb) AS p("projectId" uuid,id uuid) WHERE d.project_id=p."projectId" AND d.id=p.id AND ${eligible(table)} RETURNING 1) SELECT count(*)::text AS count FROM removed`,
          [cutoff, JSON.stringify(pages)],
        );
        return Number(row.count);
      });
    } else {
      // Each bounded DELETE commits separately, releasing row locks before the next batch.
      const [row] = await db.query<{ count: string }[]>(
        `WITH victims AS (SELECT d.ctid FROM ${table} d WHERE ${eligible(table)} LIMIT $2 FOR UPDATE SKIP LOCKED), removed AS (DELETE FROM ${table} d USING victims v WHERE d.ctid=v.ctid RETURNING 1) SELECT count(*)::text AS count FROM removed`,
        [cutoff, batchSize],
      );
      count = Number(row.count);
    }
    deleted += count;
    if (count < batchSize) return deleted;
  }
}

@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<unknown>;
  private readonly logger = new Logger(RetentionService.name);
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}
  onModuleInit() {
    if (!this.config.get<boolean>('retention.enabled', false)) return;
    const tick = () => {
      if (this.db.isInitialized && !this.running)
        this.running = this.cleanup(true)
          .catch(() => this.logger.error('Monitoring retention failed'))
          .finally(() => {
            this.running = undefined;
          });
    };
    this.timer = setInterval(
      tick,
      this.config.get<number>('retention.intervalMinutes', 60) * 60000,
    );
    this.timer.unref();
    tick();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
  async cleanup(
    execute = false,
    now = new Date(),
  ): Promise<{
    cutoff: string;
    executed: boolean;
    counts: Record<string, number>;
  }> {
    const cutoff = new Date(
      now.getTime() -
        this.config.get<number>('retention.days', MONITORING_RETENTION_DAYS) *
          86400000,
    );
    const batchSize = this.config.get<number>('retention.batchSize', 5000);
    if (
      !Number.isInteger(batchSize) ||
      batchSize < 1 ||
      batchSize > 100000 ||
      !Number.isFinite(cutoff.getTime()) ||
      cutoff >= now
    )
      throw new Error('Invalid retention configuration');
    const counts: Record<string, number> = {};
    for (const table of RETENTION_TABLES) {
      if (execute)
        counts[table] = await cleanupTable(this.db, table, cutoff, batchSize);
      else {
        const [row] = await this.db.query<{ count: string }[]>(
          `SELECT count(*)::text AS count FROM ${table} d WHERE ${eligible(table)}`,
          [cutoff],
        );
        counts[table] = Number(row.count);
      }
    }
    return { cutoff: cutoff.toISOString(), executed: execute, counts };
  }
}

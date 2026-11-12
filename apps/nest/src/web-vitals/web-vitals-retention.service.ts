import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  MONITORING_RETENTION_DAYS,
  cleanupTable,
} from '../retention/retention.service';
@Injectable()
export class WebVitalsRetentionService {
  constructor(private readonly db: DataSource) {}
  async cleanup(execute = false, now = new Date()) {
    const cutoff = new Date(
      now.getTime() - MONITORING_RETENTION_DAYS * 86400000,
    );
    let pageViews: number;
    if (execute) {
      await cleanupTable(this.db, 'monitoring_web_vitals', cutoff);
      pageViews = await cleanupTable(this.db, 'monitoring_page_views', cutoff);
    } else {
      const [row] = await this.db.query<{ count: string }[]>(
        `SELECT count(*)::text AS count FROM monitoring_page_views d WHERE d.received_at < $1 AND NOT EXISTS (SELECT 1 FROM monitoring_web_vitals w WHERE w.project_id=d.project_id AND w.page_view_id=d.id AND w.received_at >= $1)`,
        [cutoff],
      );
      pageViews = Number(row.count);
    }
    return { cutoff: cutoff.toISOString(), pageViews, executed: execute };
  }
}

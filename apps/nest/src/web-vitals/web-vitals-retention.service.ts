import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
@Injectable()
export class WebVitalsRetentionService {
  constructor(private readonly db: DataSource) {}
  async cleanup(execute = false, now = new Date()) {
    const cutoff = new Date(now.getTime() - 30 * 86400000);
    return this.db.transaction(async (m) => {
      const rows = await m.query(
        'SELECT count(*)::int AS count FROM monitoring_page_views WHERE received_at < $1',
        [cutoff],
      );
      if (execute)
        await m.query(
          'DELETE FROM monitoring_page_views WHERE received_at < $1',
          [cutoff],
        );
      return {
        cutoff: cutoff.toISOString(),
        pageViews: Number(rows[0].count),
        executed: execute,
      };
    });
  }
}

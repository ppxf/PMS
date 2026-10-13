import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class TracesRetentionService {
  constructor(private readonly dataSource: DataSource) {}
  // Dry-run by default. Explicit operator execution is required; no timer is registered.
  async cleanup(
    execute = false,
    now = new Date(),
  ): Promise<{
    cutoff: string;
    spans: number;
    batches: number;
    executed: boolean;
  }> {
    const cutoff = new Date(now.getTime() - 7 * 24 * 3600000);
    return this.dataSource.transaction(async (manager) => {
      const spanCount = await manager.query<{ count: string }[]>(
        'SELECT count(*)::text AS count FROM monitoring_spans WHERE received_at < $1',
        [cutoff],
      );
      const batchCount = await manager.query<{ count: string }[]>(
        'SELECT count(*)::text AS count FROM monitoring_trace_ingest_batches WHERE received_at < $1',
        [cutoff],
      );
      if (execute) {
        await manager.query(
          'DELETE FROM monitoring_spans WHERE received_at < $1',
          [cutoff],
        );
        await manager.query(
          'DELETE FROM monitoring_trace_ingest_batches WHERE received_at < $1',
          [cutoff],
        );
      }
      return {
        cutoff: cutoff.toISOString(),
        spans: Number(spanCount[0].count),
        batches: Number(batchCount[0].count),
        executed: execute,
      };
    });
  }
}

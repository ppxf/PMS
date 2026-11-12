import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  MONITORING_RETENTION_DAYS,
  cleanupTable,
} from '../retention/retention.service';

@Injectable()
export class TracesRetentionService {
  constructor(private readonly dataSource: DataSource) {}
  async cleanup(
    execute = false,
    now = new Date(),
  ): Promise<{
    cutoff: string;
    spans: number;
    batches: number;
    executed: boolean;
  }> {
    const cutoff = new Date(
      now.getTime() - MONITORING_RETENTION_DAYS * 86400000,
    );
    const counts: number[] = [];
    for (const table of [
      'monitoring_spans',
      'monitoring_trace_ingest_batches',
    ]) {
      if (execute)
        counts.push(await cleanupTable(this.dataSource, table, cutoff));
      else {
        const [row] = await this.dataSource.query<{ count: string }[]>(
          `SELECT count(*)::text AS count FROM ${table} WHERE received_at < $1`,
          [cutoff],
        );
        counts.push(Number(row.count));
      }
    }
    return {
      cutoff: cutoff.toISOString(),
      spans: counts[0],
      batches: counts[1],
      executed: execute,
    };
  }
}

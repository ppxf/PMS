import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ErrorTraceIndex1795737600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE INDEX monitoring_events_project_trace_span
      ON monitoring_events (project_id, (contexts->'trace'->>'traceId'),
        (contexts->'trace'->>'spanId'), timestamp DESC, id DESC)
      WHERE contexts->'trace'->>'traceId' IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX monitoring_events_project_trace_span');
  }
}

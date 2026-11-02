import { MigrationInterface, QueryRunner } from 'typeorm';

/** Complete schema baseline. Apply only to an empty database. */
export class Baseline1793577600000 implements MigrationInterface {
  name = 'Baseline1793577600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public',
    );
    await queryRunner.query(
      "CREATE TYPE \"users_status_enum\" AS ENUM('pending_verification', 'active', 'disabled')",
    );
    await queryRunner.query(
      'CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "password_hash" character varying NOT NULL, "name" character varying NOT NULL, "status" "users_status_enum" NOT NULL DEFAULT \'pending_verification\', "permissions" text array NOT NULL DEFAULT \'{}\', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE TABLE "groups" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "owner_id" uuid NOT NULL, "name" character varying NOT NULL, "slug" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_659d1483316afb28afd3a90646e" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_26b144515853842d05737965f1" ON "groups"  ("owner_id", "slug") ',
    );
    await queryRunner.query(
      'CREATE TYPE "monitoring_projects_platform_enum" AS ENUM(\'vue\')',
    );
    await queryRunner.query(
      'CREATE TABLE "monitoring_projects" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "group_id" uuid NOT NULL, "name" character varying NOT NULL, "slug" character varying NOT NULL, "platform" "monitoring_projects_platform_enum" NOT NULL, "error_monitoring_enabled" boolean NOT NULL DEFAULT true, "logging_enabled" boolean NOT NULL DEFAULT false, "tracing_enabled" boolean NOT NULL DEFAULT false, "propagation_targets" jsonb NOT NULL DEFAULT \'[]\'::jsonb, "allowed_origins" jsonb NOT NULL DEFAULT \'["*"]\'::jsonb, "reported_propagation_targets" jsonb NOT NULL DEFAULT \'[]\'::jsonb, "metrics_enabled" boolean NOT NULL DEFAULT false, "profiles_enabled" boolean NOT NULL DEFAULT false, "public_key" character varying(64) NOT NULL, "last_seen_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_0fb80fa8fba32b23090d2310084" UNIQUE ("public_key"), CONSTRAINT "PK_5e1554bfeb3fbd6beb6340d2dce" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_a1d03c4585e9f6781cd6b48c3c" ON "monitoring_projects"  ("group_id", "slug") ',
    );
    await queryRunner.query(
      'CREATE TABLE "monitoring_logs" ("project_id" uuid NOT NULL, "log_id" uuid NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "level" character varying(16) NOT NULL, "message" text NOT NULL, "attributes" jsonb NOT NULL, "environment" character varying(128), "release" character varying(128), "trace_id" character varying(32), "span_id" character varying(16), "content_hash" character varying(64) NOT NULL, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_5322a9a82d280d9edc0bd2de20c" PRIMARY KEY ("project_id", "log_id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "monitoring_logs_received" ON "monitoring_logs"  ("received_at") ',
    );
    await queryRunner.query(
      'CREATE INDEX "monitoring_logs_project_trace" ON "monitoring_logs"  ("project_id", "trace_id") ',
    );
    await queryRunner.query(
      'CREATE INDEX "monitoring_logs_project_level_time" ON "monitoring_logs"  ("project_id", "level", "timestamp") ',
    );
    await queryRunner.query(
      'CREATE INDEX "monitoring_logs_project_time" ON "monitoring_logs"  ("project_id", "timestamp") ',
    );
    await queryRunner.query(
      'CREATE TABLE "monitoring_log_batches" ("project_id" uuid NOT NULL, "event_id" uuid NOT NULL, "content_hash" character varying(64) NOT NULL, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_d2227eb4eb746e19e80d51f477c" PRIMARY KEY ("project_id", "event_id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "monitoring_log_batches_received" ON "monitoring_log_batches"  ("received_at") ',
    );
    await queryRunner.query(
      'CREATE TABLE "monitoring_metrics" ("project_id" uuid NOT NULL, "event_id" uuid NOT NULL, "sample_index" integer NOT NULL, "name" character varying(128) NOT NULL, "type" character varying(16) NOT NULL, "unit" character varying(32) NOT NULL, "value" double precision NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "attributes" jsonb NOT NULL, "environment" character varying(128), "release" character varying(128), "trace_id" character varying(32), "span_id" character varying(16), "received_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_4705d53d503c195a52c97410225" PRIMARY KEY ("project_id", "event_id", "sample_index"))',
    );
    await queryRunner.query(
      'CREATE INDEX "monitoring_metrics_trace" ON "monitoring_metrics"  ("project_id", "trace_id", "timestamp", "event_id", "sample_index") ',
    );
    await queryRunner.query(
      'CREATE INDEX "monitoring_metrics_received" ON "monitoring_metrics"  ("received_at") ',
    );
    await queryRunner.query(
      'CREATE INDEX "monitoring_metrics_lookup" ON "monitoring_metrics"  ("project_id", "name", "type", "unit", "timestamp") ',
    );
    await queryRunner.query(
      'CREATE TABLE "monitoring_metric_batches" ("project_id" uuid NOT NULL, "event_id" uuid NOT NULL, "content_hash" character varying(64) NOT NULL, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_3442e1c00370c9c8607f04773af" PRIMARY KEY ("project_id", "event_id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "monitoring_metric_batches_received" ON "monitoring_metric_batches"  ("received_at") ',
    );
    await queryRunner.query(
      'CREATE TABLE "monitoring_profiles" ("project_id" uuid NOT NULL, "profile_id" uuid NOT NULL, "started_at" TIMESTAMP WITH TIME ZONE NOT NULL, "duration_ms" double precision NOT NULL, "sample_interval_ms" double precision NOT NULL, "name" character varying(512) NOT NULL, "environment" character varying(128), "release" character varying(128), "trace_id" character varying(32), "span_id" character varying(16), "truncated" boolean NOT NULL, "sample_count" integer NOT NULL, "profile" jsonb NOT NULL, "content_hash" character varying(64) NOT NULL, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_c32fb4c27c68e9a039bd6f1176c" PRIMARY KEY ("project_id", "profile_id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "monitoring_profiles_project_trace" ON "monitoring_profiles"  ("project_id", "trace_id") ',
    );
    await queryRunner.query(
      'CREATE INDEX "monitoring_profiles_project_environment_time" ON "monitoring_profiles"  ("project_id", "environment", "started_at") ',
    );
    await queryRunner.query(
      'CREATE INDEX "monitoring_profiles_project_time" ON "monitoring_profiles"  ("project_id", "started_at", "profile_id") ',
    );
    await queryRunner.query(
      "CREATE TYPE \"auth_tokens_type_enum\" AS ENUM('email_verification', 'password_reset')",
    );
    await queryRunner.query(
      'CREATE TABLE "auth_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "type" "auth_tokens_type_enum" NOT NULL, "token_hash" character varying(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "consumed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_3a94cfa1eada85ac2bf6f3016b7" UNIQUE ("token_hash"), CONSTRAINT "PK_41e9ddfbb32da18c4e85e45c2fd" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE TABLE "monitoring_events" ("id" uuid NOT NULL, "project_id" uuid NOT NULL, "issue_id" uuid NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL, "source" character varying(32) NOT NULL, "level" character varying(16) NOT NULL, "message" character varying(2000) NOT NULL, "exception_type" character varying(128) NOT NULL, "exception_value" character varying(2000) NOT NULL, "stacktrace" text, "url" character varying(2048), "environment" character varying(128), "tags" jsonb NOT NULL DEFAULT \'{}\'::jsonb, "contexts" jsonb NOT NULL DEFAULT \'{}\'::jsonb, CONSTRAINT "PK_bd203b18c8da5b593ed793246b7" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE TABLE "monitoring_error_issues" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "fingerprint" character(64) NOT NULL, "environment" character varying(64) NOT NULL DEFAULT \'unknown\', "title" character varying(2000) NOT NULL, "exception_type" character varying(128) NOT NULL, "culprit" character varying(512), "status" character varying(16) NOT NULL DEFAULT \'unresolved\', "resolved_at" TIMESTAMP WITH TIME ZONE, "resolution_reason" character varying(32), "reopened_at" TIMESTAMP WITH TIME ZONE, "reopen_count" integer NOT NULL DEFAULT \'0\', "event_count" integer NOT NULL DEFAULT \'1\', "visibility" character varying(32) NOT NULL DEFAULT \'active\', "archive_threshold" integer, "archived_at" TIMESTAMP WITH TIME ZONE, "first_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL, "last_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL, "latest_event_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_monitoring_error_issues_archive" CHECK ((visibility = \'archived_until_count\' AND archive_threshold IN (10, 100, 1000)) OR (visibility <> \'archived_until_count\' AND archive_threshold IS NULL)), CONSTRAINT "PK_41015c07eb24a7f979c8b8b53c8" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "uq_monitoring_error_issues_project_fingerprint" ON "monitoring_error_issues"  ("project_id", "environment", "fingerprint") ',
    );
    await queryRunner.query(
      'CREATE TABLE "monitoring_error_suppressions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "environment" character varying(64) NOT NULL, "fingerprint" character(64) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_91ce2e5aa48a9c173aabccad822" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "uq_monitoring_error_suppressions_scope" ON "monitoring_error_suppressions"  ("project_id", "environment", "fingerprint") ',
    );
    await queryRunner.query(
      'CREATE TABLE "monitoring_spans" ("project_id" uuid NOT NULL, "trace_id" character varying(32) NOT NULL, "span_id" character varying(16) NOT NULL, "parent_span_id" character varying(16), "is_transaction" boolean NOT NULL, "op" character varying(64) NOT NULL, "name" character varying(512) NOT NULL, "start_time" TIMESTAMP WITH TIME ZONE NOT NULL, "end_time" TIMESTAMP WITH TIME ZONE NOT NULL, "duration_ms" double precision NOT NULL, "status" character varying(32) NOT NULL, "environment" character varying(512), "release" character varying(512), "page_route" character varying(512), "http_method" character varying(16), "http_status_code" integer, "http_route" character varying(512), "ttfb_ms" double precision, "transfer_size" double precision, "encoded_body_size" double precision, "decoded_body_size" double precision, "truncated" boolean NOT NULL, "end_reason" character varying(64) NOT NULL, "dropped_span_count" integer NOT NULL, "attributes" jsonb NOT NULL, "content_hash" character varying(64) NOT NULL, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_2d6191ad5b30dd7b0011b279844" PRIMARY KEY ("project_id", "trace_id", "span_id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "monitoring_spans_received_at" ON "monitoring_spans"  ("received_at") ',
    );
    await queryRunner.query(
      'CREATE INDEX "monitoring_spans_project_time" ON "monitoring_spans"  ("project_id", "start_time") ',
    );
    await queryRunner.query(
      'CREATE TABLE "monitoring_trace_ingest_batches" ("project_id" uuid NOT NULL, "event_id" uuid NOT NULL, "payload_hash" character varying(64) NOT NULL, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_3295cf41d442a4935555ab31d05" PRIMARY KEY ("project_id", "event_id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "monitoring_trace_batches_received_at" ON "monitoring_trace_ingest_batches"  ("received_at") ',
    );
    await queryRunner.query(
      'ALTER TABLE "groups" ADD CONSTRAINT "FK_5d7af25843377def343ab0beaa8" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "monitoring_projects" ADD CONSTRAINT "FK_8ac1b4116a49f5109c54e0163b2" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "monitoring_logs" ADD CONSTRAINT "FK_5e1e063f846124b241f3a5537a6" FOREIGN KEY ("project_id") REFERENCES "monitoring_projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "monitoring_log_batches" ADD CONSTRAINT "FK_14f2ac8862915400e18af682cad" FOREIGN KEY ("project_id") REFERENCES "monitoring_projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "monitoring_metrics" ADD CONSTRAINT "FK_8559a8f72ed2313d286d8af40ef" FOREIGN KEY ("project_id") REFERENCES "monitoring_projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "monitoring_metric_batches" ADD CONSTRAINT "FK_da61f600b674a9ece34ef0273a7" FOREIGN KEY ("project_id") REFERENCES "monitoring_projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "monitoring_profiles" ADD CONSTRAINT "FK_2c4b91e08f31f8ae26f1a24bcc9" FOREIGN KEY ("project_id") REFERENCES "monitoring_projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "auth_tokens" ADD CONSTRAINT "FK_9691367d446cd8b18f462c191b3" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "monitoring_events" ADD CONSTRAINT "FK_c03c426c28ade686a6d941f3eda" FOREIGN KEY ("project_id") REFERENCES "monitoring_projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "monitoring_events" ADD CONSTRAINT "FK_a7234068790612223314ba790ce" FOREIGN KEY ("issue_id") REFERENCES "monitoring_error_issues"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "monitoring_error_issues" ADD CONSTRAINT "FK_476319a9313e0200a794c03ca3f" FOREIGN KEY ("project_id") REFERENCES "monitoring_projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "monitoring_error_issues" ADD CONSTRAINT "FK_2b46dc1203305ca641b3e35f2f1" FOREIGN KEY ("latest_event_id") REFERENCES "monitoring_events"("id") ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "monitoring_error_suppressions" ADD CONSTRAINT "FK_0e8b37b1eee3e0514a9e8e8cf67" FOREIGN KEY ("project_id") REFERENCES "monitoring_projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "monitoring_spans" ADD CONSTRAINT "FK_487f2dafd7f2c75e8f0cba4aef5" FOREIGN KEY ("project_id") REFERENCES "monitoring_projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "monitoring_trace_ingest_batches" ADD CONSTRAINT "FK_1ebef7621c6d61db5815c726dd3" FOREIGN KEY ("project_id") REFERENCES "monitoring_projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "monitoring_trace_ingest_batches" DROP CONSTRAINT "FK_1ebef7621c6d61db5815c726dd3"',
    );
    await queryRunner.query(
      'ALTER TABLE "monitoring_spans" DROP CONSTRAINT "FK_487f2dafd7f2c75e8f0cba4aef5"',
    );
    await queryRunner.query(
      'ALTER TABLE "monitoring_error_suppressions" DROP CONSTRAINT "FK_0e8b37b1eee3e0514a9e8e8cf67"',
    );
    await queryRunner.query(
      'ALTER TABLE "monitoring_error_issues" DROP CONSTRAINT "FK_2b46dc1203305ca641b3e35f2f1"',
    );
    await queryRunner.query(
      'ALTER TABLE "monitoring_error_issues" DROP CONSTRAINT "FK_476319a9313e0200a794c03ca3f"',
    );
    await queryRunner.query(
      'ALTER TABLE "monitoring_events" DROP CONSTRAINT "FK_a7234068790612223314ba790ce"',
    );
    await queryRunner.query(
      'ALTER TABLE "monitoring_events" DROP CONSTRAINT "FK_c03c426c28ade686a6d941f3eda"',
    );
    await queryRunner.query(
      'ALTER TABLE "auth_tokens" DROP CONSTRAINT "FK_9691367d446cd8b18f462c191b3"',
    );
    await queryRunner.query(
      'ALTER TABLE "monitoring_profiles" DROP CONSTRAINT "FK_2c4b91e08f31f8ae26f1a24bcc9"',
    );
    await queryRunner.query(
      'ALTER TABLE "monitoring_metric_batches" DROP CONSTRAINT "FK_da61f600b674a9ece34ef0273a7"',
    );
    await queryRunner.query(
      'ALTER TABLE "monitoring_metrics" DROP CONSTRAINT "FK_8559a8f72ed2313d286d8af40ef"',
    );
    await queryRunner.query(
      'ALTER TABLE "monitoring_log_batches" DROP CONSTRAINT "FK_14f2ac8862915400e18af682cad"',
    );
    await queryRunner.query(
      'ALTER TABLE "monitoring_logs" DROP CONSTRAINT "FK_5e1e063f846124b241f3a5537a6"',
    );
    await queryRunner.query(
      'ALTER TABLE "monitoring_projects" DROP CONSTRAINT "FK_8ac1b4116a49f5109c54e0163b2"',
    );
    await queryRunner.query(
      'ALTER TABLE "groups" DROP CONSTRAINT "FK_5d7af25843377def343ab0beaa8"',
    );
    await queryRunner.query(
      'DROP INDEX "monitoring_trace_batches_received_at"',
    );
    await queryRunner.query('DROP TABLE "monitoring_trace_ingest_batches"');
    await queryRunner.query('DROP INDEX "monitoring_spans_project_time"');
    await queryRunner.query('DROP INDEX "monitoring_spans_received_at"');
    await queryRunner.query('DROP TABLE "monitoring_spans"');
    await queryRunner.query(
      'DROP INDEX "uq_monitoring_error_suppressions_scope"',
    );
    await queryRunner.query('DROP TABLE "monitoring_error_suppressions"');
    await queryRunner.query(
      'DROP INDEX "uq_monitoring_error_issues_project_fingerprint"',
    );
    await queryRunner.query('DROP TABLE "monitoring_error_issues"');
    await queryRunner.query('DROP TABLE "monitoring_events"');
    await queryRunner.query('DROP TABLE "auth_tokens"');
    await queryRunner.query('DROP TYPE "auth_tokens_type_enum"');
    await queryRunner.query('DROP INDEX "monitoring_profiles_project_time"');
    await queryRunner.query(
      'DROP INDEX "monitoring_profiles_project_environment_time"',
    );
    await queryRunner.query('DROP INDEX "monitoring_profiles_project_trace"');
    await queryRunner.query('DROP TABLE "monitoring_profiles"');
    await queryRunner.query('DROP INDEX "monitoring_metric_batches_received"');
    await queryRunner.query('DROP TABLE "monitoring_metric_batches"');
    await queryRunner.query('DROP INDEX "monitoring_metrics_lookup"');
    await queryRunner.query('DROP INDEX "monitoring_metrics_received"');
    await queryRunner.query('DROP INDEX "monitoring_metrics_trace"');
    await queryRunner.query('DROP TABLE "monitoring_metrics"');
    await queryRunner.query('DROP INDEX "monitoring_log_batches_received"');
    await queryRunner.query('DROP TABLE "monitoring_log_batches"');
    await queryRunner.query('DROP INDEX "monitoring_logs_project_time"');
    await queryRunner.query('DROP INDEX "monitoring_logs_project_level_time"');
    await queryRunner.query('DROP INDEX "monitoring_logs_project_trace"');
    await queryRunner.query('DROP INDEX "monitoring_logs_received"');
    await queryRunner.query('DROP TABLE "monitoring_logs"');
    await queryRunner.query('DROP INDEX "IDX_a1d03c4585e9f6781cd6b48c3c"');
    await queryRunner.query('DROP TABLE "monitoring_projects"');
    await queryRunner.query('DROP TYPE "monitoring_projects_platform_enum"');
    await queryRunner.query('DROP INDEX "IDX_26b144515853842d05737965f1"');
    await queryRunner.query('DROP TABLE "groups"');
    await queryRunner.query('DROP TABLE "users"');
    await queryRunner.query('DROP TYPE "users_status_enum"');
    // uuid-ossp may be shared by other applications; keep the extension.
  }
}

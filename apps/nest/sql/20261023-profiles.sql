-- Apply with psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/nest/sql/20261023-profiles.sql
-- Run before starting the updated server when database.synchronize=false.
BEGIN;
ALTER TABLE monitoring_projects ADD COLUMN IF NOT EXISTS profiles_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS monitoring_profiles (
  project_id uuid NOT NULL REFERENCES monitoring_projects(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  started_at timestamptz NOT NULL,
  duration_ms double precision NOT NULL CHECK (duration_ms >= 0 AND duration_ms <= 30000),
  sample_interval_ms double precision NOT NULL CHECK (sample_interval_ms > 0),
  name varchar(512) NOT NULL,
  environment varchar(128),
  release varchar(128),
  trace_id varchar(32),
  span_id varchar(16),
  truncated boolean NOT NULL,
  sample_count integer NOT NULL CHECK (sample_count >= 0 AND sample_count <= 10000),
  profile jsonb NOT NULL,
  content_hash varchar(64) NOT NULL,
  received_at timestamptz NOT NULL,
  PRIMARY KEY (project_id, profile_id)
);
CREATE INDEX IF NOT EXISTS monitoring_profiles_project_time ON monitoring_profiles (project_id, started_at, profile_id);
CREATE INDEX IF NOT EXISTS monitoring_profiles_project_environment_time ON monitoring_profiles (project_id, environment, started_at);
CREATE INDEX IF NOT EXISTS monitoring_profiles_project_trace ON monitoring_profiles (project_id, trace_id);
COMMIT;

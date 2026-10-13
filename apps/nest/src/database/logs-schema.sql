BEGIN;
CREATE TABLE IF NOT EXISTS monitoring_log_batches (
  project_id uuid NOT NULL REFERENCES monitoring_projects(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  content_hash varchar(64) NOT NULL,
  received_at timestamptz NOT NULL,
  PRIMARY KEY(project_id, event_id)
);
CREATE TABLE IF NOT EXISTS monitoring_logs (
  project_id uuid NOT NULL REFERENCES monitoring_projects(id) ON DELETE CASCADE,
  log_id uuid NOT NULL,
  timestamp timestamptz NOT NULL,
  level varchar(16) NOT NULL CHECK (level IN ('trace','debug','info','warn','error','fatal')),
  message text NOT NULL,
  attributes jsonb NOT NULL,
  environment varchar(128), release varchar(128),
  trace_id varchar(32), span_id varchar(16),
  content_hash varchar(64) NOT NULL,
  received_at timestamptz NOT NULL,
  PRIMARY KEY(project_id, log_id)
);
CREATE INDEX IF NOT EXISTS monitoring_logs_project_time ON monitoring_logs(project_id, timestamp);
CREATE INDEX IF NOT EXISTS monitoring_logs_project_level_time ON monitoring_logs(project_id, level, timestamp);
CREATE INDEX IF NOT EXISTS monitoring_logs_project_trace ON monitoring_logs(project_id, trace_id);
CREATE INDEX IF NOT EXISTS monitoring_logs_received ON monitoring_logs(received_at);
CREATE INDEX IF NOT EXISTS monitoring_log_batches_received ON monitoring_log_batches(received_at);
COMMIT;

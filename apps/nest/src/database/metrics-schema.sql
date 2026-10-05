BEGIN;
CREATE TABLE IF NOT EXISTS monitoring_metric_batches (
  project_id uuid NOT NULL REFERENCES monitoring_projects(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  content_hash varchar(64) NOT NULL,
  received_at timestamptz NOT NULL,
  PRIMARY KEY (project_id, event_id)
);
CREATE TABLE IF NOT EXISTS monitoring_metrics (
  project_id uuid NOT NULL REFERENCES monitoring_projects(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  sample_index integer NOT NULL,
  name varchar(128) NOT NULL,
  type varchar(16) NOT NULL CHECK (type IN ('count', 'gauge', 'distribution')),
  unit varchar(32) NOT NULL,
  value double precision NOT NULL,
  timestamp timestamptz NOT NULL,
  attributes jsonb NOT NULL,
  environment varchar(128),
  release varchar(128),
  trace_id varchar(32),
  span_id varchar(16),
  received_at timestamptz NOT NULL,
  PRIMARY KEY (project_id, event_id, sample_index)
);
CREATE INDEX IF NOT EXISTS monitoring_metrics_lookup ON monitoring_metrics(project_id, name, type, unit, timestamp);
CREATE INDEX IF NOT EXISTS monitoring_metrics_received ON monitoring_metrics(received_at);
CREATE INDEX IF NOT EXISTS monitoring_metric_batches_received ON monitoring_metric_batches(received_at);
COMMIT;

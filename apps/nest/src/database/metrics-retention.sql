-- Explicit operator execution. Keep receipts beyond the 24-hour SDK retry window.
BEGIN;
DELETE FROM monitoring_metrics WHERE received_at < now() - interval '7 days';
DELETE FROM monitoring_metric_batches WHERE received_at < now() - interval '7 days';
COMMIT;

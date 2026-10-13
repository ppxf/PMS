-- Explicit operator execution; receipts outlive the 24-hour retry window.
BEGIN;
DELETE FROM monitoring_logs WHERE received_at < now() - interval '7 days';
DELETE FROM monitoring_log_batches WHERE received_at < now() - interval '7 days';
COMMIT;

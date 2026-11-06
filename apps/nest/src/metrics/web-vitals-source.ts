/** Read-only projection: revisions remain in the canonical table, never appended as metric samples. */
export const WEB_VITALS_METRIC_SOURCE = `(SELECT
  v.project_id, p.id AS event_id,
  CASE v.name WHEN 'LCP' THEN 0 WHEN 'INP' THEN 1 WHEN 'CLS' THEN 2 WHEN 'FCP' THEN 3 ELSE 4 END AS sample_index,
  'browser.web_vital.' || lower(v.name) || '.value' AS name,
  'distribution'::text AS type, CASE v.name WHEN 'CLS' THEN 'none' ELSE 'ms' END AS unit,
  v.value, p.started_at AS timestamp,
  v.attribution || jsonb_build_object('page.route', p.dimensions->>'route', 'browser.name', p.dimensions->>'browser', 'device', p.dimensions->>'device', 'navigation.type', p.dimensions->>'navigationType') AS attributes,
  p.dimensions->>'environment' AS environment, p.dimensions->>'release' AS release,
  p.dimensions->>'traceId' AS trace_id, p.dimensions->>'spanId' AS span_id
 FROM monitoring_web_vitals v JOIN monitoring_page_views p ON p.project_id=v.project_id AND p.id=v.page_view_id) AS monitoring_metrics`;

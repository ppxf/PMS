import { MONITORING_RETENTION_DAYS } from '../retention/retention.constants';
export const TRACE_HISTORY_DAYS = MONITORING_RETENTION_DAYS;

export interface MonitoringSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  isTransaction: boolean;
  op: string;
  name: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  status: 'ok' | 'error' | 'cancelled' | 'deadline_exceeded' | 'unknown';
  environment?: string;
  release?: string;
  pageRoute?: string;
  httpMethod?: string;
  httpStatusCode?: number;
  httpRoute?: string;
  ttfbMs?: number;
  transferSize?: number;
  encodedBodySize?: number;
  decodedBodySize?: number;
  truncated: boolean;
  endReason: string;
  droppedSpanCount: number;
  attributes: Record<string, string | number | boolean>;
}

export interface TransactionEnvelope {
  version: 1;
  type: 'transaction';
  sentAt: string;
  transaction: { eventId: string; spans: MonitoringSpan[] };
}

export type AggregateFunction =
  'count' | 'avg' | 'p50' | 'p75' | 'p95' | 'errorRate';
export type FilterOperator =
  'eq' | 'in' | 'not_in' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists';
export interface SpanQuery {
  start: string;
  end: string;
  filters: { field: string; operator: FilterOperator; value?: unknown }[];
  metrics: { function: AggregateFunction; field: string }[];
  groupBy: string[];
  primaryMetric: number;
  limit: number;
  interval?: 'auto' | '1m' | '30m' | '1h' | '3h' | '6h' | '1d';
  page: number;
  pageSize: number;
  sortBy?: 'startTime' | 'durationMs' | number;
  sortDirection?: 'asc' | 'desc';
}

export interface SpanField {
  name: string;
  type: 'string' | 'number' | 'boolean';
  unit?: 'ms' | 'byte' | 'none';
  groupable: boolean;
  operators: FilterOperator[];
  aggregations: AggregateFunction[];
  sql: string;
}
const stringOps: FilterOperator[] = [
  'eq',
  'in',
  'not_in',
  'contains',
  'exists',
];
const numberOps: FilterOperator[] = [
  'eq',
  'in',
  'not_in',
  'gt',
  'gte',
  'lt',
  'lte',
  'exists',
];
const fields: SpanField[] = [];
function dimension(
  name: string,
  sql: string,
  type: SpanField['type'] = 'string',
) {
  fields.push({
    name,
    sql,
    type,
    groupable: true,
    operators: type === 'string' ? stringOps : ['eq', 'in', 'not_in', 'exists'],
    aggregations: [],
  });
}
function measurement(name: string, sql: string, unit: 'ms' | 'byte' | 'none') {
  fields.push({
    name,
    sql,
    unit,
    type: 'number',
    groupable: name.startsWith('browser.web_vital.'),
    operators: numberOps,
    aggregations: ['avg', 'p50', 'p75', 'p95'],
  });
}
dimension('span.op', 'op');
dimension('span.name', 'name');
dimension('is_transaction', 'is_transaction', 'boolean');
dimension('http.method', 'http_method');
dimension('http.route', 'http_route');
dimension('http.status_code', 'http_status_code', 'number');
dimension(
  'http.status_class',
  "CASE WHEN http_status_code BETWEEN 100 AND 599 THEN (http_status_code / 100)::text || 'xx' ELSE 'unknown' END",
);
dimension('http.instrumentation', "attributes->>'http.instrumentation'");
dimension('environment', 'environment');
dimension('release', 'release');
dimension('span.status', 'status');
dimension('span.truncated', 'truncated', 'boolean');
dimension('page.route', 'page_route');
measurement('span.duration', 'duration_ms', 'ms');
function vitalProjection(name: string, expression: string): string {
  return `(SELECT ${expression} FROM monitoring_web_vitals v JOIN monitoring_page_views p ON p.project_id=v.project_id AND p.id=v.page_view_id WHERE p.project_id=monitoring_spans.project_id AND p.dimensions->>'traceId'=monitoring_spans.trace_id AND p.dimensions->>'spanId'=monitoring_spans.span_id AND monitoring_spans.is_transaction AND monitoring_spans.op='pageload' AND v.name='${name}' ORDER BY p.started_at,p.id LIMIT 1)`;
}
for (const name of ['LCP', 'INP', 'CLS', 'FCP', 'TTFB']) {
  measurement(
    `browser.web_vital.${name.toLowerCase()}.value`,
    vitalProjection(name, 'v.value'),
    name === 'CLS' ? 'none' : 'ms',
  );
}
for (const key of [
  'timeToFirstByte',
  'resourceLoadDelay',
  'resourceLoadDuration',
  'elementRenderDelay',
]) {
  measurement(
    `browser.web_vital.lcp.${key}`,
    vitalProjection(
      'LCP',
      `CASE WHEN jsonb_typeof(v.attribution->'${key}')='number' THEN (v.attribution->>'${key}')::double precision END`,
    ),
    'ms',
  );
}
dimension(
  'browser.web_vital.lcp.element',
  vitalProjection(
    'LCP',
    "COALESCE(v.attribution->>'target',v.attribution->>'element')",
  ),
);
dimension(
  'browser.web_vital.inp.interactionTarget',
  vitalProjection(
    'INP',
    "COALESCE(v.attribution->>'interactionTarget',v.attribution->>'target')",
  ),
);
for (const [name, metric, key, unit] of [
  ['lcp.load_time', 'LCP', 'loadTime', 'ms'],
  ['lcp.render_time', 'LCP', 'renderTime', 'ms'],
  ['lcp.size', 'LCP', 'size', 'none'],
  ['inp.input_delay', 'INP', 'inputDelay', 'ms'],
  ['inp.processing_duration', 'INP', 'processingDuration', 'ms'],
  ['inp.presentation_delay', 'INP', 'presentationDelay', 'ms'],
] as const)
  measurement(
    `browser.web_vital.${name}`,
    vitalProjection(
      metric,
      `CASE WHEN jsonb_typeof(v.attribution->'${key}')='number' THEN (v.attribution->>'${key}')::double precision END`,
    ),
    unit,
  );
dimension(
  'browser.web_vital.lcp.url',
  vitalProjection('LCP', "v.attribution->>'url'"),
);
dimension(
  'browser.web_vital.inp.target',
  vitalProjection(
    'INP',
    "COALESCE(v.attribution->>'target',v.attribution->>'interactionTarget')",
  ),
);
dimension(
  'browser.web_vital.inp.interaction_type',
  vitalProjection('INP', "v.attribution->>'interactionType'"),
);
measurement('http.request.time_to_first_byte', 'ttfb_ms', 'ms');
measurement('http.response_transfer_size', 'transfer_size', 'byte');
measurement('http.response_content_length', 'encoded_body_size', 'byte');
measurement(
  'http.decoded_response_content_length',
  'decoded_body_size',
  'byte',
);
fields.unshift({
  name: 'spans',
  type: 'number',
  sql: '*',
  groupable: false,
  operators: [],
  aggregations: ['count', 'errorRate'],
});
export const SPAN_FIELDS = fields;
export const SPAN_FIELD_MAP = new Map(
  fields.map((field) => [field.name, field]),
);

export const HTTP_COMPLETED_SQL =
  "op = 'http.client' AND truncated = false AND status IN ('ok', 'error')";
export const HTTP_FAILED_SQL = `(${HTTP_COMPLETED_SQL}) AND (status = 'error' OR http_status_code >= 400)`;
export const HTTP_SUCCEEDED_SQL = `(${HTTP_COMPLETED_SQL}) AND status = 'ok' AND http_status_code BETWEEN 100 AND 399`;

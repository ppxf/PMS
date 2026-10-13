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

export type AggregateFunction = 'count' | 'avg' | 'p50' | 'p95' | 'errorRate';
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
  unit?: 'ms' | 'byte';
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
function measurement(name: string, sql: string, unit: 'ms' | 'byte') {
  fields.push({
    name,
    sql,
    unit,
    type: 'number',
    groupable: false,
    operators: numberOps,
    aggregations: ['avg', 'p50', 'p95'],
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

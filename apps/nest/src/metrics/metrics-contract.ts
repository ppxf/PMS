export type MetricType = 'count' | 'gauge' | 'distribution';
export type MetricAggregation =
  'sum' | 'avg' | 'min' | 'max' | 'count' | 'p50' | 'p95' | 'p99' | 'last';
export const METRIC_AGGREGATIONS: Record<
  MetricType,
  readonly MetricAggregation[]
> = {
  count: ['sum', 'count'],
  gauge: ['last', 'avg', 'min', 'max', 'count'],
  distribution: ['p95', 'p50', 'p99', 'avg', 'min', 'max', 'sum', 'count'],
};
export const METRIC_GROUP_FIELDS = [
  { key: 'client.address', label: 'client.address', type: 'string' },
  { key: 'project', label: 'project', type: 'string' },
  { key: 'sdk.name', label: 'sdk.name', type: 'string' },
  { key: 'sdk.version', label: 'sdk.version', type: 'string' },
  { key: 'user_agent.original', label: 'user_agent.original', type: 'string' },
  { key: 'value', label: 'value', type: 'number' },
  { key: 'browser.name', label: 'browser.name', type: 'string' },
  { key: 'browser.version', label: 'browser.version', type: 'string' },
] as const;
export interface MetricSample {
  name: string;
  type: MetricType;
  unit: string;
  value: number;
  timestamp: string;
  attributes: Record<string, string | number | boolean>;
  environment?: string;
  release?: string;
  traceId?: string;
  spanId?: string;
}
export interface MetricsEnvelope {
  version: 1;
  type: 'metrics';
  sentAt: string;
  eventId: string;
  samples: MetricSample[];
}
export interface MetricQuery {
  traceId?: string;
  spanId?: string;
  start: string;
  end: string;
  name: string;
  type: MetricType;
  unit: string;
  aggregation: MetricAggregation;
  filters: MetricFilter[];
  groupBy?: string | string[];
  intervalSeconds: number;
  page: number;
  pageSize: number;
}
export type MetricFilterOperator =
  'eq' | 'in' | 'not_in' | 'contains' | 'exists' | 'gt' | 'gte' | 'lt' | 'lte';
export type MetricScalar = string | number | boolean;
export interface MetricFilter {
  field: string;
  operator: MetricFilterOperator;
  value?: MetricScalar | MetricScalar[];
}
export interface TraceMetricsQuery {
  page: number;
  pageSize: number;
  search?: string;
  spanId?: string;
}

export type MetricType = 'count' | 'gauge' | 'distribution';
export type MetricAggregation =
  'sum' | 'avg' | 'min' | 'max' | 'count' | 'p50' | 'p95' | 'p99' | 'last';
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
  start: string;
  end: string;
  name: string;
  type: MetricType;
  unit: string;
  aggregation: MetricAggregation;
  environment?: string;
  filters: { key: string; value: string | number | boolean }[];
  groupBy?: string;
  intervalSeconds: number;
  page: number;
  pageSize: number;
}

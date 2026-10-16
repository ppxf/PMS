export type LogScalar = string | number | boolean;
export interface LogCondition {
  key: string;
  operator:
    | 'eq'
    | 'neq'
    | 'in'
    | 'not_in'
    | 'contains'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'exists'
    | 'not_exists';
  value?: LogScalar | LogScalar[];
}
export const LOG_AGGREGATES = [
  'count',
  'count_unique',
  'sum',
  'avg',
  'p50',
  'p75',
  'p90',
  'p95',
  'p99',
  'max',
  'min',
] as const;
export interface LogVisualization {
  aggregate: (typeof LOG_AGGREGATES)[number];
  field: string;
  groupBy?: string[];
  conditions?: LogCondition[];
}
export const LOG_LEVELS = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
export interface LogEntry {
  logId: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  attributes: Record<string, string | number | boolean>;
  environment?: string;
  release?: string;
  traceId?: string;
  spanId?: string;
}
export interface LogsEnvelope {
  version: 1;
  type: 'logs';
  sentAt: string;
  eventId: string;
  logs: LogEntry[];
}
export interface LogQuery {
  conditions?: LogCondition[];
  visualizations?: LogVisualization[];
  start: string;
  end: string;
  search?: string;
  levels: LogLevel[];
  environment?: string;
  traceId?: string;
  filters: { key: string; value: string | number | boolean }[];
  intervalSeconds: number;
  page: number;
  pageSize: number;
  sortDirection: 'asc' | 'desc';
}

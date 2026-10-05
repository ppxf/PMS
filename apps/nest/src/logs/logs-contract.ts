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

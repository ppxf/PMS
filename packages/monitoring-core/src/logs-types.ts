import type { TraceContext } from "./tracing-types.js";
export const LOG_LEVELS = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
export type LogAttributes = Record<string, string | number | boolean>;
export interface LogContext {
  traceContext?: TraceContext;
}
export interface LogEntry {
  logId: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  attributes: LogAttributes;
  environment?: string;
  release?: string;
  traceId?: string;
  spanId?: string;
}
export interface LogsEnvelope {
  version: 1;
  type: "logs";
  sentAt: string;
  eventId: string;
  logs: LogEntry[];
}
export interface FormattedLog {
  message: string;
  attributes: LogAttributes;
}
export type ConsoleLogMethod =
  "debug" | "info" | "log" | "warn" | "error" | "trace";

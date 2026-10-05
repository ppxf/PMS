import { LOG_LEVELS } from "./logs-types.js";
import type {
  ConsoleLogMethod,
  FormattedLog,
  LogAttributes,
  LogContext,
  LogEntry,
  LogLevel,
  LogsEnvelope,
} from "./logs-types.js";
import type { MonitoringInitOptions, Transport } from "./types.js";

interface Pending {
  envelope: LogsEnvelope;
  attempts: number;
  sending?: Promise<void>;
  timer?: ReturnType<typeof setTimeout>;
}
const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).length;
function validAttributes(value: unknown): value is LogAttributes {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length <= 20 &&
    Object.entries(value).every(
      ([key, v]) =>
        key.length > 0 &&
        key.length <= 64 &&
        !["__proto__", "prototype", "constructor"].includes(key) &&
        ((typeof v === "string" && v.length <= 256) ||
          typeof v === "boolean" ||
          (typeof v === "number" &&
            Number.isFinite(v) &&
            Math.abs(v) <= Number.MAX_SAFE_INTEGER)),
    )
  );
}
function validEntry(entry: LogEntry): boolean {
  return (
    typeof entry.message === "string" &&
    entry.message.length > 0 &&
    entry.message.length <= 4096 &&
    LOG_LEVELS.includes(entry.level) &&
    validAttributes(entry.attributes) &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      entry.logId,
    ) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(
      entry.timestamp,
    ) &&
    Date.parse(entry.timestamp) >= Date.now() - 86400000 &&
    Date.parse(entry.timestamp) <= Date.now() + 300000 &&
    [entry.environment, entry.release].every(
      (v) =>
        v === undefined ||
        (typeof v === "string" && v.length > 0 && v.length <= 128),
    ) &&
    ((entry.traceId === undefined && entry.spanId === undefined) ||
      (typeof entry.traceId === "string" &&
        /^[a-f0-9]{32}$/.test(entry.traceId) &&
        !/^0+$/.test(entry.traceId) &&
        typeof entry.spanId === "string" &&
        /^[a-f0-9]{16}$/.test(entry.spanId) &&
        !/^0+$/.test(entry.spanId))) &&
    bytes(entry) <= 8192
  );
}
export function createLogs() {
  let config: MonitoringInitOptions | undefined,
    transport: Transport | undefined;
  let buffer: LogEntry[] = [],
    bufferBytes = 0,
    droppedLogs = 0,
    suppressed = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const queue = new Set<Pending>(),
    restorers = new Set<() => void>();
  function quiet<T>(action: () => T): T {
    suppressed++;
    try {
      return action();
    } finally {
      suppressed--;
    }
  }
  function send(item: Pending): Promise<void> {
    if (item.sending) return item.sending;
    if (item.timer) clearTimeout(item.timer);
    item.timer = undefined;
    item.attempts++;
    const sender = transport;
    item.sending = Promise.resolve().then(async () => {
      if (!queue.has(item)) return;
      try {
        await quiet(() => sender?.send(item.envelope));
        queue.delete(item);
      } catch (error) {
        if (!queue.has(item)) return;
        const status =
          error && typeof error === "object" && "status" in error
            ? (error as { status?: number }).status
            : undefined;
        if (
          (status === undefined ||
            status === 429 ||
            (status >= 500 && status <= 599)) &&
          item.attempts < 3
        ) {
          item.timer = setTimeout(
            () => {
              void send(item);
            },
            1000 * 2 ** (item.attempts - 1),
          );
        } else {
          queue.delete(item);
          droppedLogs += item.envelope.logs.length;
        }
        try {
          void Promise.resolve(
            quiet(() => config?.onTransportError?.(error, item.envelope)),
          ).catch(() => undefined);
        } catch {
          /* A reporting callback cannot fail the application. */
        }
      } finally {
        item.sending = undefined;
      }
    });
    return item.sending;
  }
  function seal() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (!buffer.length) return;
    const logs = buffer;
    buffer = [];
    bufferBytes = 0;
    if (queue.size >= 10) {
      droppedLogs += logs.length;
      return;
    }
    const envelope: LogsEnvelope = {
      version: 1,
      type: "logs",
      eventId: crypto.randomUUID(),
      sentAt: new Date().toISOString(),
      logs,
    };
    const item: Pending = { envelope, attempts: 0 };
    queue.add(item);
    void send(item);
  }
  function record(
    level: LogLevel,
    message: string | FormattedLog,
    attributes: LogAttributes = {},
    context: LogContext = {},
  ) {
    if (!config?.enableLogs || suppressed) return;
    try {
      const formatted =
        typeof message === "string" ? { message, attributes: {} } : message;
      if (
        !formatted ||
        !validAttributes(attributes) ||
        !validAttributes(formatted.attributes)
      ) {
        droppedLogs++;
        return;
      }
      let entry: LogEntry = {
        logId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        level,
        message: formatted.message,
        attributes: { ...formatted.attributes, ...attributes },
        ...(config.environment
          ? { environment: config.environment.slice(0, 128) }
          : {}),
        ...(config.release ? { release: config.release.slice(0, 128) } : {}),
        ...(context.traceContext
          ? {
              traceId: context.traceContext.traceId,
              spanId: context.traceContext.spanId,
            }
          : {}),
      };
      if (!validEntry(entry)) {
        droppedLogs++;
        return;
      }
      if (config.beforeSendLog) {
        const filtered = quiet(() =>
          config!.beforeSendLog!({
            ...entry,
            attributes: { ...entry.attributes },
          }),
        );
        if (!filtered) {
          droppedLogs++;
          return;
        }
        entry = filtered;
      }
      if (!validEntry(entry)) {
        droppedLogs++;
        return;
      }
      // Only protocol fields survive the hook; snapshots cannot change after buffering.
      entry = {
        logId: entry.logId,
        timestamp: entry.timestamp,
        level: entry.level,
        message: entry.message,
        attributes: { ...entry.attributes },
        ...(entry.environment ? { environment: entry.environment } : {}),
        ...(entry.release ? { release: entry.release } : {}),
        ...(entry.traceId
          ? { traceId: entry.traceId, spanId: entry.spanId }
          : {}),
      };
      const size = bytes(entry);
      if (bufferBytes + size > 196608) seal();
      buffer.push(entry);
      bufferBytes += size;
      if (buffer.length >= 50) seal();
      else if (!timer) timer = setTimeout(seal, 5000);
    } catch {
      droppedLogs++;
    }
  }
  const logger = Object.assign(
    Object.fromEntries(
      LOG_LEVELS.map((level) => [
        level,
        (
          message: string | FormattedLog,
          attributes?: LogAttributes,
          context?: LogContext,
        ) => record(level, message, attributes, context),
      ]),
    ) as Record<
      LogLevel,
      (
        message: string | FormattedLog,
        attributes?: LogAttributes,
        context?: LogContext,
      ) => void
    >,
    {
      fmt(
        strings: TemplateStringsArray,
        ...values: (string | number | boolean)[]
      ): FormattedLog {
        const attributes: LogAttributes = {};
        const message = strings.reduce((text, part, index) => {
          if (index < values.length) {
            attributes[`message.parameter.${index}`] = values[index];
            return text + part + String(values[index]);
          }
          return text + part;
        }, "");
        return { message, attributes };
      },
    },
  );
  function captureConsoleLogs(
    target: Pick<Console, ConsoleLogMethod> = console,
    levels: readonly ConsoleLogMethod[] = ["warn", "error"],
  ): () => void {
    if (!config?.enableLogs) return () => {};
    if (
      levels.some(
        (method) =>
          !["debug", "info", "log", "warn", "error", "trace"].includes(
            method,
          ) || typeof target[method] !== "function",
      )
    )
      throw new TypeError("Unsupported console log level");
    const cleanups: (() => void)[] = [];
    let active = true;
    for (const method of new Set(levels)) {
      if (!["debug", "info", "log", "warn", "error", "trace"].includes(method))
        throw new TypeError("Unsupported console log level");
      const original = target[method];
      const wrapper = (...args: unknown[]) => {
        original.apply(target, args);
        if (
          !active ||
          suppressed ||
          (typeof args[0] === "string" &&
            args[0].startsWith("[PMS Monitoring]"))
        )
          return;
        try {
          const message = args
            .map((value) =>
              value instanceof Error
                ? `${value.name}: ${value.message}`
                : typeof value === "string"
                  ? value
                  : (JSON.stringify(value) ?? String(value)),
            )
            .join(" ")
            .slice(0, 4096);
          record(method === "log" ? "info" : method, message, {
            "log.source": "console",
          });
        } catch {
          /* Console serialization is best effort. */
        }
      };
      target[method] = wrapper;
      cleanups.push(() => {
        if (target[method] === wrapper) target[method] = original;
      });
    }
    const restore = () => {
      active = false;
      cleanups.forEach((fn) => fn());
      restorers.delete(restore);
    };
    restorers.add(restore);
    return restore;
  }
  return {
    logger,
    captureConsoleLogs,
    configure(options: MonitoringInitOptions, sender: Transport) {
      config = options;
      transport = sender;
    },
    async flush() {
      seal();
      await Promise.all([...queue].map(send));
    },
    getLogStats: () => ({
      bufferedLogs: buffer.length,
      queuedBatches: queue.size,
      droppedLogs,
    }),
    reset() {
      if (timer) clearTimeout(timer);
      queue.forEach((item) => {
        if (item.timer) clearTimeout(item.timer);
      });
      queue.clear();
      restorers.forEach((fn) => fn());
      buffer = [];
      bufferBytes = 0;
      droppedLogs = 0;
      timer = undefined;
      config = undefined;
      transport = undefined;
    },
  };
}

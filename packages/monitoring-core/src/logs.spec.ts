import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogs } from "./logs.js";
import { LOG_LEVELS } from "./logs-types.js";
import { TransportError } from "./http-transport.js";
const instances: ReturnType<typeof createLogs>[] = [];
function setup(options = {}) {
  const logs = createLogs(),
    send = vi.fn().mockResolvedValue(undefined);
  instances.push(logs);
  logs.configure(
    {
      dsn: "https://key@example.com/api/sdk/project",
      enableLogs: true,
      ...options,
    },
    { send },
  );
  return { logs, send };
}
afterEach(() => {
  instances.splice(0).forEach((logs) => logs.reset());
  vi.useRealTimers();
});
describe("structured logs", () => {
  it("records all levels, snapshots attributes and preserves explicit trace context", async () => {
    const { logs, send } = setup({ environment: "prod" }),
      attributes = { count: 2 };
    for (const level of LOG_LEVELS) logs.logger[level]("message", attributes);
    attributes.count = 9;
    logs.logger.info(
      logs.logger.fmt`Order ${12}`,
      {},
      {
        traceContext: {
          traceId: "a".repeat(32),
          spanId: "b".repeat(16),
          sampled: true,
        },
      },
    );
    await logs.flush();
    expect(
      send.mock.calls[0][0].logs.map((log: { level: string }) => log.level),
    ).toEqual([...LOG_LEVELS, "info"]);
    expect(send.mock.calls[0][0].logs[0]).toMatchObject({
      attributes: { count: 2 },
      environment: "prod",
    });
    expect(send.mock.calls[0][0].logs[6]).toMatchObject({
      message: "Order 12",
      attributes: { "message.parameter.0": 12 },
      traceId: "a".repeat(32),
    });
  });
  it("redacts through the hook and suppresses hook recursion", async () => {
    const { logs, send } = setup({
      beforeSendLog: (log: any) => {
        logs.logger.error("recursive");
        return log.message === "discard"
          ? null
          : { ...log, message: "redacted" };
      },
    });
    logs.logger.info("secret");
    logs.logger.info("discard");
    await logs.flush();
    expect(send.mock.calls[0][0].logs).toHaveLength(1);
    expect(send.mock.calls[0][0].logs[0].message).toBe("redacted");
    expect(logs.getLogStats().droppedLogs).toBe(1);
  });
  it("rejects malformed hook identities and invalid values without throwing", async () => {
    const { logs, send } = setup({
      beforeSendLog: (log: any) => ({ ...log, logId: "-".repeat(36) }),
    });
    logs.logger.info("bad");
    logs.logger.info("bad", { nested: {} } as any);
    logs.logger.info("x".repeat(4097));
    await logs.flush();
    expect(send).not.toHaveBeenCalled();
    expect(logs.getLogStats().droppedLogs).toBe(3);
  });
  it("flushes on time and at 50 records", async () => {
    vi.useFakeTimers();
    const { logs, send } = setup();
    logs.logger.warn("timed");
    await vi.advanceTimersByTimeAsync(5000);
    expect(send).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 50; i++) logs.logger.info("batch");
    await logs.flush();
    expect(send.mock.calls[1][0].logs).toHaveLength(50);
  });
  it("retries transient failures with stable identity and drops permanent failures", async () => {
    vi.useFakeTimers();
    const { logs, send } = setup();
    send.mockRejectedValueOnce(new TransportError("busy", { status: 429 }));
    logs.logger.error("retry");
    await logs.flush();
    const batch = send.mock.calls[0][0];
    await vi.advanceTimersByTimeAsync(1000);
    expect(send.mock.calls[1][0]).toBe(batch);
    send.mockRejectedValueOnce(new TransportError("disabled", { status: 403 }));
    logs.logger.error("drop");
    await logs.flush();
    expect(logs.getLogStats()).toMatchObject({
      queuedBatches: 0,
      droppedLogs: 1,
    });
  });
  it("bounds pending batches and leaves disabled clients silent", () => {
    vi.useFakeTimers();
    const { logs, send } = setup();
    send.mockImplementation(() => new Promise(() => {}));
    for (let i = 0; i < 550; i++) logs.logger.info("queued");
    expect(logs.getLogStats()).toMatchObject({
      queuedBatches: 10,
      droppedLogs: 50,
    });
    const disabled = setup({ enableLogs: false });
    disabled.logs.logger.info("ignored");
    expect(disabled.logs.getLogStats().bufferedLogs).toBe(0);
  });
  it("preserves console calls, restores capture and validates levels atomically", async () => {
    const { logs, send } = setup(),
      original = vi.fn(),
      target = { warn: original, error: vi.fn() } as any;
    expect(() =>
      logs.captureConsoleLogs(target, ["warn", "invalid"] as any),
    ).toThrow();
    expect(target.warn).toBe(original);
    const restore = logs.captureConsoleLogs(target, ["warn"]);
    target.warn("warning", 3);
    restore();
    target.warn("uncaptured");
    await logs.flush();
    expect(original).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0].logs).toHaveLength(1);
    expect(target.warn).toBe(original);
  });
});

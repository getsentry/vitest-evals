import { describe, expect, test, vi } from "vitest";
import { installShutdownHandlers } from "./cli";

type TestSignal = "SIGINT" | "SIGTERM";

function createLifecycle() {
  const handlers = new Map<TestSignal, () => Promise<void> | void>();
  return {
    handlers,
    lifecycle: {
      exit: vi.fn(),
      once: vi.fn(
        (signal: TestSignal, listener: () => Promise<void> | void) => {
          handlers.set(signal, listener);
        },
      ),
    },
  };
}

describe("installShutdownHandlers", () => {
  test("closes the server and exits on SIGINT", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const { handlers, lifecycle } = createLifecycle();

    installShutdownHandlers({ close }, lifecycle);
    await handlers.get("SIGINT")?.();

    expect(close).toHaveBeenCalledTimes(1);
    expect(lifecycle.exit).toHaveBeenCalledWith(0);
  });

  test("exits once when shutdown is requested more than once", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const { handlers, lifecycle } = createLifecycle();

    installShutdownHandlers({ close }, lifecycle);
    await handlers.get("SIGINT")?.();
    await handlers.get("SIGTERM")?.();

    expect(close).toHaveBeenCalledTimes(1);
    expect(lifecycle.exit).toHaveBeenCalledTimes(1);
  });

  test("exits with failure when closing the server fails", async () => {
    const close = vi.fn().mockRejectedValue(new Error("close failed"));
    const { handlers, lifecycle } = createLifecycle();

    installShutdownHandlers({ close }, lifecycle);
    await handlers.get("SIGTERM")?.();

    expect(lifecycle.exit).toHaveBeenCalledWith(1);
  });
});

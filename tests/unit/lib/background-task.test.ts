import { afterEach, describe, expect, it, vi } from "vitest";

const nextAfter = vi.hoisted(() => vi.fn());

vi.mock("next/server", () => ({ after: nextAfter }));

import { runAfterResponse } from "@/lib/background-task";

afterEach(() => {
  nextAfter.mockReset();
});

describe("runAfterResponse", () => {
  it("uses Next's request-scoped scheduler when available", async () => {
    nextAfter.mockImplementation((task: () => void) => task());
    const task = vi.fn();

    runAfterResponse(task, "test_task");
    await vi.waitFor(() => expect(task).toHaveBeenCalledOnce());
  });

  it("runs directly when no request scope exists", async () => {
    nextAfter.mockImplementation(() => {
      throw new Error("after was called outside a request scope");
    });
    const task = vi.fn();

    runAfterResponse(task, "test_task");
    await vi.waitFor(() => expect(task).toHaveBeenCalledOnce());
  });
});

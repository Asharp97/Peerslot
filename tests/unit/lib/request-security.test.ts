import { afterEach, describe, expect, it } from "vitest";

import {
  clearRateLimitsForTests,
  enforceRateLimit,
  requireSameOriginJson,
} from "@/lib/request-security";

afterEach(clearRateLimitsForTests);

describe("request security", () => {
  it("returns 429 with a retry window after the configured limit", async () => {
    const request = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "203.0.113.4" },
    });

    expect(
      await enforceRateLimit(request, "test", { limit: 1, windowSeconds: 60 }),
    ).toBeNull();
    const blocked = await enforceRateLimit(request, "test", {
      limit: 1,
      windowSeconds: 60,
    });

    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("Retry-After")).toBe("60");
  });

  it("rejects non-JSON and cross-origin mutations", () => {
    expect(
      requireSameOriginJson(
        new Request("http://localhost/api/test", { method: "POST" }),
      )?.status,
    ).toBe(415);
    expect(
      requireSameOriginJson(
        new Request("http://localhost/api/test", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://attacker.example",
          },
        }),
      )?.status,
    ).toBe(403);
  });
});

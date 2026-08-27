import { describe, expect, it } from "vitest";

import { resolveDatabaseUrl } from "@/lib/database-url";

describe("database environment separation", () => {
  it("uses the dedicated preview database in Vercel previews", () => {
    expect(
      resolveDatabaseUrl({
        VERCEL_ENV: "preview",
        PREVIEW_DATABASE_URL: "postgresql://preview",
      }),
    ).toBe("postgresql://preview");
  });

  it("fails closed when a preview database is not configured", () => {
    expect(() =>
      resolveDatabaseUrl({
        VERCEL_ENV: "preview",
        DATABASE_URL: "postgresql://production",
      }),
    ).toThrow(/PREVIEW_DATABASE_URL/);
  });

  it("rejects an explicitly known production URL in preview", () => {
    expect(() =>
      resolveDatabaseUrl({
        VERCEL_ENV: "preview",
        PREVIEW_DATABASE_URL: "postgresql://same",
        PRODUCTION_DATABASE_URL: "postgresql://same",
      }),
    ).toThrow(/must not match/);
  });

  it("rejects a preview URL inherited through DATABASE_URL", () => {
    expect(() =>
      resolveDatabaseUrl({
        VERCEL_ENV: "preview",
        PREVIEW_DATABASE_URL: "postgresql://same",
        DATABASE_URL: "postgresql://same",
      }),
    ).toThrow(/must not match/);
  });

  it("uses DATABASE_URL outside preview deployments", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: "postgresql://local" })).toBe(
      "postgresql://local",
    );
  });
});

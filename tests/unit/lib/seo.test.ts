import { describe, expect, it } from "vitest";

import { createLocalizedAlternates, resolveSiteUrl } from "@/lib/seo";

describe("SEO URLs", () => {
  it("uses the configured public site origin", () => {
    expect(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: "https://peerslot.example/some/path",
      }).toString(),
    ).toBe("https://peerslot.example/");
  });

  it("falls back to the Better Auth origin", () => {
    expect(
      resolveSiteUrl({
        BETTER_AUTH_URL: "https://auth.peerslot.example",
      }).toString(),
    ).toBe("https://auth.peerslot.example/");
  });

  it("rejects a non-http site URL", () => {
    expect(() =>
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "peerslot.example" }),
    ).toThrow(/absolute http/);
  });

  it("creates absolute reciprocal alternates and an x-default", () => {
    expect(
      createLocalizedAlternates("tr", "/policy/privacy", {
        NEXT_PUBLIC_SITE_URL: "https://peerslot.example",
      }),
    ).toEqual({
      canonical: "https://peerslot.example/tr/policy/privacy",
      languages: {
        en: "https://peerslot.example/en/policy/privacy",
        tr: "https://peerslot.example/tr/policy/privacy",
        "x-default": "https://peerslot.example/en/policy/privacy",
      },
    });
  });
});

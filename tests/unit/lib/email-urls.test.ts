import { afterEach, describe, expect, it, vi } from "vitest";
import { emailActionUrl, emailApplicationUrl } from "@/lib/email-urls";

afterEach(() => vi.unstubAllEnvs());
describe("email action URLs", () => {
  it.each([
    "javascript:alert(1)",
    "data:text/html,hello",
    "ftp://peerslot.com/file",
    "https://user:secret@peerslot.com/",
    "http://peerslot.com/en",
  ])("rejects unsafe action URL %s", (url) => {
    expect(() => emailActionUrl(url)).toThrow();
  });
  it.each([
    "http://localhost:3000/en",
    "https://localhost/en",
    "https://127.0.0.1/en",
    "https://[::1]/en",
  ])("blocks production emails linking to %s", (url) => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => emailActionUrl(url)).toThrow("public HTTPS URL");
  });
  it("keeps local development links working", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(emailActionUrl("http://localhost:3000/en")).toBe(
      "http://localhost:3000/en",
    );
  });
  it("uses the configured public site for appointment links", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.peerslot.com");
    vi.stubEnv("BETTER_AUTH_URL", "https://peerslot.com");
    expect(emailApplicationUrl("/tr/account")).toBe(
      "https://www.peerslot.com/tr/account",
    );
  });
  it("fails instead of silently putting localhost in production mail", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("BETTER_AUTH_URL", "");
    expect(() => emailApplicationUrl("/en/account")).toThrow(
      "public HTTPS URL",
    );
  });
});

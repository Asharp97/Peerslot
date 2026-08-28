import { describe, expect, it } from "vitest";

import { formatTimeZoneLabel, getTimeZones } from "@/lib/time-zones";

describe("time-zone options", () => {
  it("includes UTC and preserves the provider's current zone", () => {
    const timeZones = getTimeZones("Custom/Legacy_Zone");

    expect(timeZones[0]).toBe("Custom/Legacy_Zone");
    expect(timeZones).toContain("UTC");
    expect(new Set(timeZones).size).toBe(timeZones.length);
  });

  it("localizes time-zone labels without changing their IANA value", () => {
    const englishLabel = formatTimeZoneLabel("Europe/Istanbul", "en");
    const turkishLabel = formatTimeZoneLabel("Europe/Istanbul", "tr");

    expect(englishLabel).toMatch(/\(Europe\/Istanbul\)$/);
    expect(turkishLabel).toMatch(/\(Europe\/Istanbul\)$/);
    expect(englishLabel).not.toBe("Europe/Istanbul");
    expect(turkishLabel).not.toBe("Europe/Istanbul");
  });

  it("falls back to the IANA value for an unsupported legacy zone", () => {
    expect(formatTimeZoneLabel("Custom/Legacy_Zone", "tr")).toBe(
      "Custom/Legacy_Zone",
    );
  });
});

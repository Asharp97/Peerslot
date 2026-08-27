import { describe, expect, it } from "vitest";

import {
  createLegalAcceptance,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from "@/lib/legal-consent";

describe("legal consent records", () => {
  const acceptedAt = new Date("2026-08-21T09:30:00.000Z");

  it("stamps email registration consent with server-owned values", () => {
    expect(
      createLegalAcceptance({ termsAccepted: true }, null, acceptedAt),
    ).toEqual({
      termsAccepted: true,
      termsAcceptedAt: acceptedAt,
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
    });
  });

  it("accepts consent carried in signed OAuth state", () => {
    expect(
      createLegalAcceptance({}, { termsAccepted: true }, acceptedAt),
    ).not.toBeNull();
  });

  it("rejects account creation without explicit consent", () => {
    expect(createLegalAcceptance({}, null, acceptedAt)).toBeNull();
  });
});

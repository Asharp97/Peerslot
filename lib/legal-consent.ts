export const TERMS_VERSION = "2026-08-18";
export const PRIVACY_VERSION = "2026-08-18";

export const legalConsentAdditionalFields = {
  termsAccepted: true,
} as const;

export function createLegalAcceptance(
  userInput: Record<string, unknown>,
  oauthState: unknown,
  acceptedAt = new Date(),
) {
  const state =
    oauthState && typeof oauthState === "object"
      ? (oauthState as Record<string, unknown>)
      : null;
  if (userInput.termsAccepted !== true && state?.termsAccepted !== true) {
    return null;
  }

  return {
    termsAccepted: true,
    termsAcceptedAt: acceptedAt,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
  } as const;
}

import { createHmac, timingSafeEqual } from "node:crypto";

export const bookingIntentCookieName = "peerslot-booking-intent";
export const bookingIntentLifetimeSeconds = 10 * 60;

type BookingIntent = {
  bookingPageId: string;
  selectedStartTime: string;
  selectedEndTime: string;
  locale: string;
  expiresAt: number;
};

export function createBookingIntent(
  input: Omit<BookingIntent, "expiresAt">,
  now = Date.now(),
): BookingIntent {
  return {
    ...input,
    expiresAt: now + bookingIntentLifetimeSeconds * 1000,
  };
}

export function signBookingIntent(intent: BookingIntent, secret: string) {
  const payload = Buffer.from(JSON.stringify(intent)).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function readBookingIntent(
  value: string | undefined,
  secret: string,
  now = Date.now(),
) {
  if (!value) return null;

  const [payload, suppliedSignature, extra] = value.split(".");
  if (!payload || !suppliedSignature || extra) return null;

  const expectedSignature = signature(payload, secret);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);

  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return null;
  }

  try {
    const intent = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as BookingIntent;

    if (
      typeof intent.bookingPageId !== "string" ||
      typeof intent.selectedStartTime !== "string" ||
      typeof intent.selectedEndTime !== "string" ||
      typeof intent.locale !== "string" ||
      typeof intent.expiresAt !== "number" ||
      intent.expiresAt <= now
    ) {
      return null;
    }

    return intent;
  } catch {
    return null;
  }
}

export function getBookingIntentSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required");
  return secret;
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

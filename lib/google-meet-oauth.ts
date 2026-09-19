import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { providerGoogleMeetConnections } from "@/db/schema";

export const GOOGLE_MEET_SCOPE =
  "https://www.googleapis.com/auth/meetings.space.created";
export const MEET_OAUTH_COOKIE = "peerslot-meet-oauth";
export const MEET_OAUTH_PATH = "/api/provider/google-meet/callback";

export function googleMeetConfig() {
  const dedicated = Boolean(
    process.env.GOOGLE_MEET_CLIENT_ID || process.env.GOOGLE_MEET_CLIENT_SECRET,
  );
  const clientId = dedicated
    ? process.env.GOOGLE_MEET_CLIENT_ID
    : process.env.GOOGLE_CLIENT_ID;
  const clientSecret = dedicated
    ? process.env.GOOGLE_MEET_CLIENT_SECRET
    : process.env.GOOGLE_CLIENT_SECRET;
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseUrl = process.env.BETTER_AUTH_URL;
  if (!clientId || !clientSecret || !secret || !baseUrl) return null;
  return {
    clientId,
    clientSecret,
    secret,
    baseUrl,
    redirectUri: new URL(MEET_OAUTH_PATH, baseUrl).toString(),
  };
}

const stateSchema = z.object({
  state: z.string().min(32),
  verifier: z.string().min(43),
  providerId: z.string().min(1),
  locale: z.enum(["en", "tr"]),
  expiresAt: z.number(),
});

export async function createMeetAuthorization(
  providerId: string,
  locale: "en" | "tr",
) {
  const config = googleMeetConfig();
  if (!config) throw new Error("Google Meet is not configured");
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: `openid email ${GOOGLE_MEET_SCOPE}`,
    access_type: "offline",
    prompt: "consent select_account",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  const cookie = await symmetricEncrypt({
    key: config.secret,
    data: JSON.stringify({
      state,
      verifier,
      providerId,
      locale,
      expiresAt: Date.now() + 10 * 60_000,
    }),
  });
  return { url: url.toString(), cookie };
}

export async function readMeetAuthorization(
  cookie: string | undefined,
  state: string | null,
  providerId: string,
) {
  const config = googleMeetConfig();
  if (!config || !cookie || !state) return null;
  try {
    const data = stateSchema.parse(
      JSON.parse(await symmetricDecrypt({ key: config.secret, data: cookie })),
    );
    const expected = Buffer.from(data.state);
    const actual = Buffer.from(state);
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual) ||
      data.providerId !== providerId ||
      data.expiresAt <= Date.now()
    )
      return null;
    return data;
  } catch {
    return null;
  }
}

export async function saveMeetAuthorization(
  providerId: string,
  code: string,
  verifier: string,
) {
  const config = googleMeetConfig();
  if (!config) throw new Error("Google Meet is not configured");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      code_verifier: verifier,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Google authorization failed");
  const tokens = z
    .object({
      access_token: z.string().min(1),
      refresh_token: z.string().min(1),
      scope: z.string(),
    })
    .parse(await response.json());
  if (!tokens.scope.split(/\s+/).includes(GOOGLE_MEET_SCOPE))
    throw new Error("Google Meet permission was not granted");
  const identityResponse = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    },
  );
  if (!identityResponse.ok) throw new Error("Unable to verify Google account");
  const identity = z
    .object({
      sub: z.string().min(1),
      email: z.string().email(),
      email_verified: z.literal(true),
    })
    .parse(await identityResponse.json());
  const values = {
    googleAccountId: identity.sub,
    email: identity.email,
    encryptedRefreshToken: await symmetricEncrypt({
      key: config.secret,
      data: tokens.refresh_token,
    }),
    connectedAt: new Date(),
  };
  await db
    .insert(providerGoogleMeetConnections)
    .values({ providerId, ...values })
    .onConflictDoUpdate({
      target: providerGoogleMeetConnections.providerId,
      set: values,
    });
}

export async function getMeetConnection(providerId: string) {
  const [connection] = await db
    .select()
    .from(providerGoogleMeetConnections)
    .where(eq(providerGoogleMeetConnections.providerId, providerId))
    .limit(1);
  return connection ?? null;
}

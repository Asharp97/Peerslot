import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { providerGoogleMeetConnections } from "@/db/schema";
import { authorizeApiProvider } from "@/lib/api-authorization";
import {
  createMeetAuthorization,
  getMeetConnection,
  googleMeetConfig,
  MEET_OAUTH_COOKIE,
  MEET_OAUTH_PATH,
} from "@/lib/google-meet-oauth";
import {
  enforceRateLimit,
  requireSameOriginJson,
} from "@/lib/request-security";

export async function GET(request: Request) {
  const authorization = await authorizeApiProvider(request);
  if (!authorization.authorized) return authorization.response;
  const connection = await getMeetConnection(authorization.currentUser.user.id);
  return NextResponse.json(
    {
      configured: Boolean(googleMeetConfig()),
      connected: Boolean(connection),
      email: connection?.email ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const guard = requireSameOriginJson(request);
  if (guard) return guard;
  const authorization = await authorizeApiProvider(request);
  if (!authorization.authorized) return authorization.response;
  if (!googleMeetConfig())
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const providerId = authorization.currentUser.user.id;
  const limited = enforceRateLimit(request, "google-meet-connect", {
    limit: 10,
    windowSeconds: 60,
    subject: providerId,
  });
  if (limited) return limited;
  const input = z
    .object({ locale: z.enum(["en", "tr"]) })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const { url, cookie } = await createMeetAuthorization(
    providerId,
    input.data.locale,
  );
  const response = NextResponse.json(
    { url },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(MEET_OAUTH_COOKIE, cookie, {
    httpOnly: true,
    secure: new URL(googleMeetConfig()!.baseUrl).protocol === "https:",
    sameSite: "lax",
    path: MEET_OAUTH_PATH,
    maxAge: 600,
  });
  return response;
}

export async function DELETE(request: Request) {
  const guard = requireSameOriginJson(request);
  if (guard) return guard;
  const authorization = await authorizeApiProvider(request);
  if (!authorization.authorized) return authorization.response;
  await db
    .delete(providerGoogleMeetConnections)
    .where(
      eq(
        providerGoogleMeetConnections.providerId,
        authorization.currentUser.user.id,
      ),
    );
  return NextResponse.json(
    { connected: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}

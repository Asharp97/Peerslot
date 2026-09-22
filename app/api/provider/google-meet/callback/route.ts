import { after, NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { providerProfiles } from "@/db/schema";
import { auth } from "@/lib/auth";
import { createUpcomingMeetings } from "@/lib/google-meet";
import {
  googleMeetConfig,
  MEET_OAUTH_COOKIE,
  MEET_OAUTH_PATH,
  readMeetAuthorization,
  saveMeetAuthorization,
} from "@/lib/google-meet-oauth";

export const maxDuration = 180;

export async function GET(request: NextRequest) {
  const config = googleMeetConfig();
  if (!config)
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  let locale = "en";
  let outcome = "error";
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (session) {
      const state = await readMeetAuthorization(
        request.cookies.get(MEET_OAUTH_COOKIE)?.value,
        request.nextUrl.searchParams.get("state"),
        session.user.id,
      );
      if (state) {
        locale = state.locale;
        const code = request.nextUrl.searchParams.get("code");
        const [provider] = await db
          .select({ id: providerProfiles.userId })
          .from(providerProfiles)
          .where(eq(providerProfiles.userId, session.user.id))
          .limit(1);
        if (provider && code && !request.nextUrl.searchParams.has("error")) {
          await saveMeetAuthorization(provider.id, code, state.verifier);
          outcome = "connected";
          after(async () => {
            await createUpcomingMeetings(provider.id).catch(() => undefined);
          });
        }
      }
    }
  } catch {
    // Report a safe, translated message on Settings instead of exposing OAuth details.
  }
  const response = NextResponse.redirect(
    new URL(`/${locale}/account-settings?meet=${outcome}`, config.baseUrl),
  );
  response.cookies.set(MEET_OAUTH_COOKIE, "", {
    path: MEET_OAUTH_PATH,
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(config.baseUrl).protocol === "https:",
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

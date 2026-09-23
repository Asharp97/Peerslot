import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { profiles } from "@/db/schema";
import { authorizeApiUser } from "@/lib/api-authorization";
import {
  accountPreferencesSchema,
  defaultAccountPreferences,
  parseAccountPreferences,
} from "@/lib/account-preferences";
import { requireSameOriginJson } from "@/lib/request-security";

export async function GET(request: Request) {
  const authorization = await authorizeApiUser(request);
  if (!authorization.authorized) return authorization.response;

  const [row] = await db
    .select({ preferences: profiles.preferences })
    .from(profiles)
    .where(eq(profiles.userId, authorization.currentUser.user.id))
    .limit(1);

  return NextResponse.json(
    { preferences: parseAccountPreferences(row?.preferences) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  const invalidRequest = requireSameOriginJson(request);
  if (invalidRequest) return invalidRequest;

  const authorization = await authorizeApiUser(request);
  if (!authorization.authorized) return authorization.response;

  const input = accountPreferencesSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success) {
    return NextResponse.json(
      { error: "Invalid account preferences", issues: input.error.issues },
      { status: 400 },
    );
  }

  const userId = authorization.currentUser.user.id;
  const [updated] = await db
    .insert(profiles)
    .values({ userId, preferences: input.data })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: { preferences: input.data },
    })
    .returning({ preferences: profiles.preferences });

  return NextResponse.json(
    { preferences: parseAccountPreferences(updated?.preferences ?? defaultAccountPreferences) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

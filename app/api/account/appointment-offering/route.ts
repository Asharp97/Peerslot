import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { authorizeApiUser } from "@/lib/api-authorization";
import { isPostgresError } from "@/lib/database-errors";
import { findProviderSetup } from "@/lib/provider-profiles";
import { requireSameOriginJson } from "@/lib/request-security";

export async function PATCH(request: Request) {
  const invalid = requireSameOriginJson(request);
  if (invalid) return invalid;
  const authorization = await authorizeApiUser(request);
  if (!authorization.authorized) return authorization.response;
  const input = z
    .object({ offersAppointments: z.boolean() })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json(
      { error: "Invalid appointment offering setting" },
      { status: 400 },
    );
  }
  const userId = authorization.currentUser.user.id;
  try {
    await db.update(user).set(input.data).where(eq(user.id, userId));
  } catch (error) {
    if (isPostgresError(error, "P0001", "offering_pending_requests")) {
      return NextResponse.json(
        {
          code: "pending_requests",
          error:
            "Review your pending requests before turning off appointment offering.",
        },
        { status: 409 },
      );
    }
    throw error;
  }
  const setup = await findProviderSetup(userId);
  return NextResponse.json(
    {
      ...input.data,
      setupRequired:
        input.data.offersAppointments &&
        (!setup?.profile.setupCompleted || !setup.bookingPage),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

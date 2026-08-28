import { and, asc, eq, gt, inArray, isNull, notExists, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import {
  appointments,
  availabilitySlots,
  availabilityWindows,
} from "@/db/schema";
import { authorizeApiProvider } from "@/lib/api-authorization";

export async function GET(request: Request) {
  const authorization = await authorizeApiProvider(request);
  if (!authorization.authorized) return authorization.response;
  const { currentUser } = authorization;

  const teacherId = currentUser.user.id;

  const slots = await db
    .select({
      id: availabilitySlots.id,
      teacherId: availabilitySlots.teacherId,
      startsAt: availabilitySlots.startsAt,
      endsAt: availabilitySlots.endsAt,
    })
    .from(availabilitySlots)
    .leftJoin(
      availabilityWindows,
      eq(availabilityWindows.id, availabilitySlots.availabilityWindowId),
    )
    .where(
      and(
        eq(availabilitySlots.teacherId, teacherId),
        gt(availabilitySlots.startsAt, new Date()),
        or(
          isNull(availabilitySlots.availabilityWindowId),
          eq(availabilityWindows.isActive, true),
        ),
        notExists(
          db
            .select({ id: appointments.id })
            .from(appointments)
            .where(
              and(
                eq(appointments.slotId, availabilitySlots.id),
                inArray(appointments.status, ["pending", "scheduled"]),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(availabilitySlots.startsAt));

  return NextResponse.json({ slots });
}

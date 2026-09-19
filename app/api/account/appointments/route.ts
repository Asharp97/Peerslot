import { NextResponse } from "next/server";
import { authorizeApiUser } from "@/lib/api-authorization";
import {
  listStudentAppointments,
  listAppointmentAgenda,
} from "@/lib/student-appointments";
import { createDateRangeSchema } from "@/lib/date-schema";

import { appointmentAgendaQuerySchema } from "@/lib/appointment-agenda";

const rangeSchema = createDateRangeSchema(
  93,
  "Calendar range cannot exceed 93 days",
);

export async function GET(request: Request) {
  const authorization = await authorizeApiUser(request);
  if (!authorization.authorized) return authorization.response;
  const params = new URL(request.url).searchParams;
  if (params.has("view") || params.has("cursor")) {
    const query = appointmentAgendaQuerySchema.safeParse({
      view: params.get("view"),
      cursor: params.get("cursor") ?? undefined,
    });
    if (!query.success || params.has("startsAt") || params.has("endsAt")) {
      return NextResponse.json({ error: "invalid_query" }, { status: 400 });
    }
    return NextResponse.json(
      await listAppointmentAgenda(
        authorization.currentUser.user.id,
        query.data,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const hasRange = params.has("startsAt") || params.has("endsAt");
  const range = hasRange
    ? rangeSchema.safeParse({
        startsAt: params.get("startsAt"),
        endsAt: params.get("endsAt"),
      })
    : null;
  if (range && !range.success) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  }
  return NextResponse.json(
    {
      appointments: range?.success
        ? await listStudentAppointments(
            authorization.currentUser.user.id,
            new Date(),
            range.data,
          )
        : await listStudentAppointments(authorization.currentUser.user.id),
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}

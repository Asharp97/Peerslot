import { NextResponse } from "next/server";
import { authorizeApiUser } from "@/lib/api-authorization";
import { listStudentAppointments } from "@/lib/student-appointments";
import { createDateRangeSchema } from "@/lib/date-schema";

const rangeSchema = createDateRangeSchema(
  93,
  "Calendar range cannot exceed 93 days",
);

export async function GET(request: Request) {
  const authorization = await authorizeApiUser(request);
  if (!authorization.authorized) return authorization.response;
  const params = new URL(request.url).searchParams;
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

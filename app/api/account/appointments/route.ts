import { NextResponse } from "next/server";
import { authorizeApiUser } from "@/lib/api-authorization";
import { listStudentAppointments } from "@/lib/student-appointments";

export async function GET(request: Request) {
  const authorization = await authorizeApiUser(request);
  if (!authorization.authorized) return authorization.response;
  return NextResponse.json(
    {
      appointments: await listStudentAppointments(
        authorization.currentUser.user.id,
      ),
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}

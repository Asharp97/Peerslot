import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiUser } from "@/lib/api-authorization";
import {
  createDateRangeSchema,
  timestampWithOffsetSchema,
} from "@/lib/date-schema";
import {
  requireSameOriginJson,
  enforceRateLimit,
} from "@/lib/request-security";
import { StudentAppointmentChangeError } from "@/lib/student-appointment-policy";
import {
  changeStudentAppointment,
  getStudentRescheduleTimes,
} from "@/lib/student-appointments";
import * as studentAppointments from "@/lib/student-appointments";
import {
  emailLocaleFromRequest,
  notifyProviderOfAppointmentChange,
} from "@/lib/email-notifications";

const dateSchema = timestampWithOffsetSchema.transform(
  (value) => new Date(value),
);
const changeSchema = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("cancel"), occurrenceStartsAt: dateSchema })
    .strict(),
  z
    .object({
      action: z.literal("reschedule"),
      occurrenceStartsAt: dateSchema,
      startsAt: dateSchema,
    })
    .strict(),
]);
const rangeSchema = createDateRangeSchema(
  45,
  "Availability range cannot exceed 45 days",
);
type Context = { params: Promise<{ id: string }> };

function changeError(error: unknown) {
  if (!(error instanceof StudentAppointmentChangeError)) throw error;
  return NextResponse.json(
    { error: error.code },
    {
      status:
        error.code === "not_found"
          ? 404
          : error.code === "notice" || error.code === "reschedule_limit"
            ? 403
            : 409,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function GET(request: Request, context: Context) {
  const authorization = await authorizeApiUser(request);
  if (!authorization.authorized) return authorization.response;
  const id = z
    .string()
    .uuid()
    .safeParse((await context.params).id);
  const params = new URL(request.url).searchParams;
  const occurrence = dateSchema.safeParse(params.get("occurrenceStartsAt"));
  const range = rangeSchema.safeParse({
    startsAt: params.get("startsAt"),
    endsAt: params.get("endsAt"),
  });
  if (!id.success || !occurrence.success || !range.success)
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  try {
    return NextResponse.json(
      {
        availableTimes: await getStudentRescheduleTimes(
          authorization.currentUser.user.id,
          id.data,
          occurrence.data,
          range.data,
        ),
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return changeError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  const guard = requireSameOriginJson(request);
  if (guard) return guard;
  const authorization = await authorizeApiUser(request);
  if (!authorization.authorized) return authorization.response;
  const studentId = authorization.currentUser.user.id;
  const limited = await enforceRateLimit(request, "student-appointment-change", {
    limit: 20,
    windowSeconds: 60,
    subject: studentId,
  });
  if (limited) return limited;
  const id = z
    .string()
    .uuid()
    .safeParse((await context.params).id);
  const input = changeSchema.safeParse(await request.json().catch(() => null));
  if (!id.success || !input.success)
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  try {
    const context = await loadStudentChangeContext(
      studentId,
      id.data,
      input.data.occurrenceStartsAt,
    );
    const appointment = await changeStudentAppointment(
      studentId,
      id.data,
      input.data,
    );
    if (context) await notifyProviderOfAppointmentChange({
      appointmentId: context.appointmentId,
      change: input.data.action === "cancel" ? "cancelled" : "rescheduled",
      endsAt: appointment.endsAt,
      locale: emailLocaleFromRequest(request),
      previousEndsAt: context.previousEndsAt,
      previousStartsAt: context.previousStartsAt,
      providerEmail: context.providerEmail,
      providerName: context.providerName,
      startsAt: appointment.startsAt,
      studentName: authorization.currentUser.user.name,
      timeZone: context.timeZone,
    });
    return NextResponse.json(
      {
        appointment,
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return changeError(error);
  }
}

async function loadStudentChangeContext(
  studentId: string,
  appointmentId: string,
  occurrenceStartsAt: Date,
) {
  let loader: typeof studentAppointments.getStudentAppointmentChangeContext;
  try {
    loader = studentAppointments.getStudentAppointmentChangeContext;
  } catch {
    return null;
  }
  if (typeof loader !== "function") return null;
  return loader(studentId, appointmentId, occurrenceStartsAt);
}

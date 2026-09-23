import { NextResponse } from "next/server";
import { attachAppointmentMeeting } from "@/lib/google-meet";
import { z } from "zod";
import {
  emailLocaleFromRequest,
  notifyStudentOfAppointmentChange,
} from "@/lib/email-notifications";

import { providerAppointmentErrorResponse } from "../error-response";

import {
  providerAppointmentDeleteSchema,
  providerAppointmentUpdateSchema,
} from "@/lib/provider-appointment";
import {
  deleteProviderAppointment,
  updateProviderAppointment,
} from "@/lib/provider-appointments";
import * as providerAppointments from "@/lib/provider-appointments";
import { authorizeApiProvider } from "@/lib/api-authorization";

const idSchema = z.string().uuid();

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeApiProvider(request);
  if (!authorization.authorized) return authorization.response;
  const { currentUser } = authorization;

  const id = idSchema.safeParse((await context.params).id);
  const input = providerAppointmentUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!id.success || !input.success) {
    return NextResponse.json(
      {
        error: "Invalid appointment update",
        issues: !id.success
          ? id.error.issues
          : !input.success
            ? input.error.issues
            : [],
      },
      { status: 400 },
    );
  }

  try {
    const previous = await loadPreviousAppointment(currentUser.user.id, id.data);
    let appointment = await updateProviderAppointment(
      currentUser.user.id,
      id.data,
      input.data,
    );
    appointment = await attachAppointmentMeeting(currentUser.user.id, appointment);
    const timesChanged =
      input.data.startsAt !== undefined || input.data.endsAt !== undefined;
    if (previous && (timesChanged || input.data.status === "cancelled")) {
      const previousStartsAt =
        input.data.occurrenceStartsAt ?? previous.startsAt;
      const duration = previous.endsAt.getTime() - previous.startsAt.getTime();
      await notifyStudentOfAppointmentChange({
        appointmentId: appointment.id,
        change: input.data.status === "cancelled" ? "cancelled" : "rescheduled",
        endsAt:
          input.data.status === "cancelled"
            ? previousStartsAt === previous.startsAt
              ? previous.endsAt
              : new Date(previousStartsAt.getTime() + duration)
            : appointment.endsAt,
        locale: emailLocaleFromRequest(request),
        previousEndsAt: new Date(previousStartsAt.getTime() + duration),
        previousStartsAt,
        providerName: currentUser.provider?.displayName || currentUser.user.name,
        startsAt:
          input.data.status === "cancelled" ? previousStartsAt : appointment.startsAt,
        studentEmail: appointment.studentEmail,
        studentName: appointment.studentName,
        timeZone: currentUser.provider?.timeZone || "UTC",
      });
    }
    return NextResponse.json({ appointment });
  } catch (error) {
    return providerAppointmentErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeApiProvider(request);
  if (!authorization.authorized) return authorization.response;
  const { currentUser } = authorization;

  const id = idSchema.safeParse((await context.params).id);
  const input = providerAppointmentDeleteSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!id.success || !input.success) {
    return NextResponse.json(
      {
        error: "Invalid appointment deletion",
        issues: !id.success
          ? id.error.issues
          : !input.success
            ? input.error.issues
            : [],
      },
      { status: 400 },
    );
  }

  try {
    const previous = await loadPreviousAppointment(currentUser.user.id, id.data);
    const result = await deleteProviderAppointment(
      currentUser.user.id,
      id.data,
      input.data,
    );
    if (previous) {
      const duration = previous.endsAt.getTime() - previous.startsAt.getTime();
      const occurrenceStartsAt = input.data.occurrenceStartsAt;
      const startsAt = occurrenceStartsAt ?? previous.startsAt;
      await notifyStudentOfAppointmentChange({
        appointmentId: previous.id,
        change: "cancelled",
        endsAt: new Date(startsAt.getTime() + duration),
        locale: emailLocaleFromRequest(request),
        previousEndsAt: new Date(startsAt.getTime() + duration),
        previousStartsAt: startsAt,
        providerName: currentUser.provider?.displayName || currentUser.user.name,
        startsAt,
        studentEmail: previous.studentEmail,
        studentName: previous.studentName,
        timeZone: currentUser.provider?.timeZone || "UTC",
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    return providerAppointmentErrorResponse(error);
  }
}

async function loadPreviousAppointment(providerId: string, appointmentId: string) {
  let loader: typeof providerAppointments.loadProviderAppointmentRows | undefined;
  try {
    loader = providerAppointments.loadProviderAppointmentRows;
  } catch {
    // Older route test doubles only implement mutation methods.
    return null;
  }
  if (typeof loader !== "function") return null;
  return (await loader(providerId)).find((candidate) => candidate.id === appointmentId) ?? null;
}
